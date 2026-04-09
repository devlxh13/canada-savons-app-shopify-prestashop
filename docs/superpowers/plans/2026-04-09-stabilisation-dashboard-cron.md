# Stabilisation, Retry, Dashboard & Cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add retry engine with immediate+deferred retry, configurable per-resource cron scheduling, enriched dashboard with charts/filters/operational view, and full test coverage (unit + integration + E2E).

**Architecture:** Incremental approach — data models first, then retry engine, cron dispatcher, dashboard enrichment, and finally E2E tests. Each phase is independently deployable. A single Vercel cron (`*/15 * * * *`) dispatches all scheduled syncs by reading `CronConfig` from the database.

**Tech Stack:** Next.js 16, Prisma 6 (Neon PostgreSQL), Recharts (via shadcn Charts), Playwright, Vitest, shadcn/ui with @base-ui/react.

**Spec:** `docs/superpowers/specs/2026-04-09-stabilisation-dashboard-cron-design.md`

---

## File Structure

### New files
```
src/lib/sync/retry.ts              — Retry logic: immediate backoff + queue management
src/lib/sync/stats.ts              — SyncStat upsert helper
src/lib/cron/dispatcher.ts         — Cron dispatch logic: read CronConfig, decide what to run
src/lib/cron/schedule.ts           — Compute nextRunAt from cronExpression
src/app/api/sync/retry/route.ts    — Deferred retry endpoint
src/app/api/sync/cron/route.ts     — Cron dispatcher endpoint (called by Vercel cron)
src/app/api/settings/cron/route.ts — GET all cron configs
src/app/api/settings/cron/[resourceType]/route.ts — PUT config + POST run now
src/app/api/retry/route.ts         — GET retry queue items (for dashboard)
src/app/(dashboard)/retry/page.tsx  — Retry queue page
src/components/dashboard/sync-chart.tsx     — Recharts AreaChart
src/components/dashboard/kpi-cards.tsx      — 5 KPI cards
src/components/dashboard/filter-bar.tsx     — Shared filter bar
src/components/dashboard/retry-badge.tsx    — Notification badge
src/components/dashboard/scheduled-syncs.tsx — Cron status block
src/components/dashboard/retry-summary.tsx  — Retry queue summary block
prisma/seed.ts                     — Seed CronConfig defaults
tests/unit/sync/retry.test.ts
tests/unit/sync/stats.test.ts
tests/unit/cron/dispatcher.test.ts
tests/unit/cron/schedule.test.ts
tests/integration/sync-flow.test.ts
tests/integration/retry-flow.test.ts
tests/integration/cron-dispatch.test.ts
tests/e2e/overview.spec.ts
tests/e2e/sync.spec.ts
tests/e2e/settings.spec.ts
tests/e2e/logs.spec.ts
tests/e2e/retry.spec.ts
playwright.config.ts
```

### Modified files
```
prisma/schema.prisma               — Add RetryQueue, CronConfig, SyncStat models
src/lib/sync/engine.ts             — Integrate immediate retry + stat recording
src/app/api/sync/route.ts          — Record SyncStats after batch completes
src/app/(dashboard)/page.tsx       — Refonte: KPI + chart + operational blocks
src/app/(dashboard)/logs/page.tsx  — Add filter bar
src/app/(dashboard)/mapping/page.tsx — Add filter bar
src/app/(dashboard)/settings/page.tsx — Add cron config table
src/app/(dashboard)/layout.tsx     — Add retry badge
src/components/layout/sidebar.tsx  — Add /retry nav link + badge count
vercel.json                        — Replace cron with dispatcher
package.json                       — Add recharts, @playwright/test, cron-parser
```

---

## Phase 1 — Foundations

### Task 1: Prisma schema — add RetryQueue, CronConfig, SyncStat

**Files:**
- Modify: `prisma/schema.prisma:66` (after Product model)

- [ ] **Step 1: Add the 3 new models to schema.prisma**

Append after the Product model (line 66):

```prisma
model RetryQueue {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  jobId        String   @map("job_id")
  resourceType String   @map("resource_type")
  psId         Int      @map("ps_id")
  attemptCount Int      @default(0) @map("attempt_count")
  lastError    String   @map("last_error") @db.Text
  status       String   @default("pending") // pending | retrying | resolved | abandoned
  nextRetryAt  DateTime @default(now()) @map("next_retry_at") @db.Timestamptz()
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@index([status, nextRetryAt])
  @@index([resourceType])
  @@map("retry_queue")
}

model CronConfig {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  resourceType   String    @unique @map("resource_type")
  enabled        Boolean   @default(true)
  cronExpression String    @map("cron_expression")
  lastRunAt      DateTime? @map("last_run_at") @db.Timestamptz()
  nextRunAt      DateTime? @map("next_run_at") @db.Timestamptz()
  lastJobId      String?   @map("last_job_id")

  @@map("cron_config")
}

model SyncStat {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  date         DateTime @db.Date
  resourceType String   @map("resource_type")
  created      Int      @default(0)
  updated      Int      @default(0)
  skipped      Int      @default(0)
  errors       Int      @default(0)
  durationMs   Int      @default(0) @map("duration_ms")

  @@unique([date, resourceType])
  @@map("sync_stats")
}
```

- [ ] **Step 2: Generate and apply migration**

Run: `npx prisma migrate dev --name add-retry-cron-stats`
Expected: Migration created and applied successfully.

- [ ] **Step 3: Verify generated client**

Run: `npx prisma generate`
Expected: Prisma Client generated successfully.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add RetryQueue, CronConfig, SyncStat models"
```

---

### Task 2: Seed CronConfig defaults

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (add prisma.seed config)

- [ ] **Step 1: Create seed script**

```ts
// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const defaults = [
  { resourceType: "products", cronExpression: "0 */6 * * *", enabled: true },
  { resourceType: "inventory", cronExpression: "0 */2 * * *", enabled: true },
  { resourceType: "customers", cronExpression: "0 7 * * *", enabled: true },
  { resourceType: "orders", cronExpression: "0 20 * * *", enabled: false },
];

async function main() {
  for (const config of defaults) {
    await prisma.cronConfig.upsert({
      where: { resourceType: config.resourceType },
      create: config,
      update: {},
    });
  }
  console.log("Seeded CronConfig defaults");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add seed config to package.json**

Add to `package.json` at root level:

```json
"prisma": {
  "seed": "npx tsx prisma/seed.ts"
}
```

- [ ] **Step 3: Install tsx and run seed**

Run: `npm install -D tsx && npx prisma db seed`
Expected: "Seeded CronConfig defaults"

- [ ] **Step 4: Commit**

```bash
git add prisma/seed.ts package.json package-lock.json
git commit -m "feat: seed CronConfig with default schedules"
```

---

## Phase 2 — Retry Engine

### Task 3: Cron schedule utility

**Files:**
- Create: `src/lib/cron/schedule.ts`
- Test: `tests/unit/cron/schedule.test.ts`

- [ ] **Step 1: Install cron-parser**

Run: `npm install cron-parser`

- [ ] **Step 2: Write failing tests**

```ts
// tests/unit/cron/schedule.test.ts
import { describe, it, expect } from "vitest";
import { computeNextRun, FREQUENCY_PRESETS } from "@/lib/cron/schedule";

describe("computeNextRun", () => {
  it("computes next run for every-2-hours cron", () => {
    const from = new Date("2026-04-09T10:00:00Z");
    const next = computeNextRun("0 */2 * * *", from);
    expect(next).toEqual(new Date("2026-04-09T12:00:00Z"));
  });

  it("computes next run for daily cron", () => {
    const from = new Date("2026-04-09T07:30:00Z");
    const next = computeNextRun("0 7 * * *", from);
    expect(next).toEqual(new Date("2026-04-10T07:00:00Z"));
  });

  it("computes next run for every-15-min cron", () => {
    const from = new Date("2026-04-09T10:05:00Z");
    const next = computeNextRun("*/15 * * * *", from);
    expect(next).toEqual(new Date("2026-04-09T10:15:00Z"));
  });
});

describe("FREQUENCY_PRESETS", () => {
  it("contains all expected presets", () => {
    const labels = FREQUENCY_PRESETS.map((p) => p.label);
    expect(labels).toContain("15min");
    expect(labels).toContain("1x/jour");
  });

  it("each preset has a valid cron expression", () => {
    for (const preset of FREQUENCY_PRESETS) {
      expect(() => computeNextRun(preset.cron, new Date())).not.toThrow();
    }
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cron/schedule.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement schedule utility**

```ts
// src/lib/cron/schedule.ts
import { parseExpression } from "cron-parser";

export const FREQUENCY_PRESETS = [
  { label: "15min", cron: "*/15 * * * *" },
  { label: "30min", cron: "*/30 * * * *" },
  { label: "1h", cron: "0 * * * *" },
  { label: "2h", cron: "0 */2 * * *" },
  { label: "4h", cron: "0 */4 * * *" },
  { label: "6h", cron: "0 */6 * * *" },
  { label: "12h", cron: "0 */12 * * *" },
  { label: "1x/jour", cron: "0 7 * * *" },
] as const;

export function computeNextRun(cronExpression: string, from: Date): Date {
  const interval = parseExpression(cronExpression, {
    currentDate: from,
    utc: true,
  });
  return interval.next().toDate();
}

export function cronToLabel(cronExpression: string): string {
  const preset = FREQUENCY_PRESETS.find((p) => p.cron === cronExpression);
  return preset?.label ?? cronExpression;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cron/schedule.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/cron/schedule.ts tests/unit/cron/schedule.test.ts package.json package-lock.json
git commit -m "feat: cron schedule utility with presets"
```

---

### Task 4: Retry utility — backoff logic and queue management

**Files:**
- Create: `src/lib/sync/retry.ts`
- Test: `tests/unit/sync/retry.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/sync/retry.test.ts
import { describe, it, expect, vi } from "vitest";
import { withImmediateRetry, computeDeferredNextRetry, IMMEDIATE_MAX_ATTEMPTS, DEFERRED_MAX_ATTEMPTS } from "@/lib/sync/retry";

describe("withImmediateRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue({ psId: 1, action: "create", shopifyGid: "gid://1" });
    const result = await withImmediateRetry(fn);
    expect(result).toEqual({ psId: 1, action: "create", shopifyGid: "gid://1" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("API down"));
    await expect(withImmediateRetry(fn)).rejects.toThrow("API down");
    expect(fn).toHaveBeenCalledTimes(IMMEDIATE_MAX_ATTEMPTS);
  });

  it("succeeds on second attempt", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ psId: 1, action: "create", shopifyGid: "gid://1" });
    const result = await withImmediateRetry(fn);
    expect(result.action).toBe("create");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("computeDeferredNextRetry", () => {
  it("returns 15min delay for attempts 4-6", () => {
    const now = new Date("2026-04-09T10:00:00Z");
    expect(computeDeferredNextRetry(4, now)).toEqual(new Date("2026-04-09T10:15:00Z"));
    expect(computeDeferredNextRetry(6, now)).toEqual(new Date("2026-04-09T10:15:00Z"));
  });

  it("returns 1h delay for attempts 7-8", () => {
    const now = new Date("2026-04-09T10:00:00Z");
    expect(computeDeferredNextRetry(7, now)).toEqual(new Date("2026-04-09T11:00:00Z"));
  });

  it("returns 4h delay for attempts 9-10", () => {
    const now = new Date("2026-04-09T10:00:00Z");
    expect(computeDeferredNextRetry(9, now)).toEqual(new Date("2026-04-09T14:00:00Z"));
  });
});

describe("constants", () => {
  it("IMMEDIATE_MAX_ATTEMPTS is 3", () => {
    expect(IMMEDIATE_MAX_ATTEMPTS).toBe(3);
  });

  it("DEFERRED_MAX_ATTEMPTS is 10", () => {
    expect(DEFERRED_MAX_ATTEMPTS).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/sync/retry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement retry utility**

```ts
// src/lib/sync/retry.ts
import type { SyncResult } from "./types";

export const IMMEDIATE_MAX_ATTEMPTS = 3;
export const DEFERRED_MAX_ATTEMPTS = 10;

/** Backoff delays for immediate retry: 1s, 3s, 9s */
function immediateDelay(attempt: number): number {
  return 1000 * Math.pow(3, attempt - 1);
}

/**
 * Wraps a sync function with immediate retry (up to 3 attempts with exponential backoff).
 * If all attempts fail, throws the last error — caller is responsible for queueing.
 */
export async function withImmediateRetry(
  fn: () => Promise<SyncResult>
): Promise<SyncResult> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= IMMEDIATE_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < IMMEDIATE_MAX_ATTEMPTS) {
        await sleep(immediateDelay(attempt));
      }
    }
  }

  throw lastError!;
}

/**
 * Compute the next retry time for deferred retries.
 * Attempts 4-6: 15 minutes, 7-8: 1 hour, 9-10: 4 hours.
 */
export function computeDeferredNextRetry(attemptCount: number, from: Date): Date {
  let delayMs: number;
  if (attemptCount <= 6) {
    delayMs = 15 * 60 * 1000; // 15 min
  } else if (attemptCount <= 8) {
    delayMs = 60 * 60 * 1000; // 1 hour
  } else {
    delayMs = 4 * 60 * 60 * 1000; // 4 hours
  }
  return new Date(from.getTime() + delayMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/sync/retry.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/retry.ts tests/unit/sync/retry.test.ts
git commit -m "feat: retry utility with immediate backoff + deferred scheduling"
```

---

### Task 5: SyncStat aggregation helper

**Files:**
- Create: `src/lib/sync/stats.ts`
- Test: `tests/unit/sync/stats.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/sync/stats.test.ts
import { describe, it, expect, vi } from "vitest";
import { recordSyncStats } from "@/lib/sync/stats";

describe("recordSyncStats", () => {
  it("upserts stats for today", async () => {
    const mockPrisma = {
      syncStat: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    await recordSyncStats(mockPrisma as any, "product", {
      created: 5,
      updated: 3,
      skipped: 10,
      errors: 1,
      durationMs: 12345,
    });

    expect(mockPrisma.syncStat.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.syncStat.upsert.mock.calls[0][0];
    expect(call.where.date_resourceType.resourceType).toBe("product");
    expect(call.create.created).toBe(5);
    expect(call.update.created.increment).toBe(5);
  });

  it("truncates date to day boundary", async () => {
    const mockPrisma = {
      syncStat: { upsert: vi.fn().mockResolvedValue({}) },
    };

    await recordSyncStats(mockPrisma as any, "customer", {
      created: 1, updated: 0, skipped: 0, errors: 0, durationMs: 100,
    });

    const call = mockPrisma.syncStat.upsert.mock.calls[0][0];
    const date = call.where.date_resourceType.date as Date;
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/sync/stats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement stats helper**

```ts
// src/lib/sync/stats.ts
import type { PrismaClient } from "@prisma/client";

interface StatCounts {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function recordSyncStats(
  prisma: PrismaClient,
  resourceType: string,
  counts: StatCounts
): Promise<void> {
  const date = todayUTC();

  await (prisma as any).syncStat.upsert({
    where: { date_resourceType: { date, resourceType } },
    create: {
      date,
      resourceType,
      ...counts,
    },
    update: {
      created: { increment: counts.created },
      updated: { increment: counts.updated },
      skipped: { increment: counts.skipped },
      errors: { increment: counts.errors },
      durationMs: { increment: counts.durationMs },
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/sync/stats.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/stats.ts tests/unit/sync/stats.test.ts
git commit -m "feat: SyncStat aggregation helper with daily upsert"
```

---

### Task 6: Integrate immediate retry into SyncEngine

**Files:**
- Modify: `src/lib/sync/engine.ts:16-81` (syncSingleProduct), similarly for Customer/Order

- [ ] **Step 1: Update engine.test.ts with retry test**

Add to `tests/lib/sync/engine.test.ts`:

```ts
import { vi } from "vitest";

// Add to existing describe block:
it("retries on first failure then succeeds", async () => {
  // Mock PS connector to fail once then succeed
  const mockPs = {
    get: vi.fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ id: 1, name: [{ id: "1", value: "Test" }], description: [], description_short: [], meta_title: [], meta_description: [], link_rewrite: [{ id: "1", value: "test" }], reference: "REF1", ean13: "", price: "10.00", active: "1", id_tax_rules_group: "1", weight: "0", id_category_default: "1", id_default_image: "0", associations: {} }),
    list: vi.fn().mockResolvedValue([]),
  };
  const mockShopify = {
    findExistingProduct: vi.fn().mockResolvedValue(null),
    createProduct: vi.fn().mockResolvedValue({ id: "gid://shopify/Product/1" }),
    setInventory: vi.fn().mockResolvedValue(undefined),
  };
  const mockPrisma = {
    idMapping: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    syncLog: { create: vi.fn().mockResolvedValue({}) },
    retryQueue: { create: vi.fn().mockResolvedValue({}) },
  };

  const engine = new SyncEngine(mockPs as any, mockShopify as any, mockPrisma as any);
  const result = await engine.syncSingleProduct(1, "job-1");

  expect(result.action).toBe("create");
  expect(mockPs.get).toHaveBeenCalledTimes(2); // 1 fail + 1 success
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/sync/engine.test.ts`
Expected: FAIL — retry not implemented yet

- [ ] **Step 3: Modify SyncEngine to use withImmediateRetry and queue on failure**

In `src/lib/sync/engine.ts`, update the imports and wrap each sync method:

Add at top:
```ts
import { withImmediateRetry, computeDeferredNextRetry } from "./retry";
```

Replace the `syncSingleProduct` method body — wrap the core logic in `withImmediateRetry`, and in the catch block, insert into `RetryQueue` instead of just logging:

```ts
async syncSingleProduct(psId: number, jobId: string): Promise<SyncResult> {
  try {
    return await withImmediateRetry(async () => {
      const psProduct = await this.ps.get<PSProduct>("products", psId);
      const transformed = transformProduct(psProduct);
      const hash = contentHash(transformed);

      const existing = await (this.prisma as any).idMapping.findUnique({
        where: { resourceType_psId: { resourceType: "product", psId } },
      });

      if (existing?.dataHash === hash) {
        await this.log(jobId, "product", psId, "skip");
        return { psId, action: "skip" as const, shopifyGid: existing.shopifyGid };
      }

      let shopifyGid: string;
      let action: "create" | "update";

      if (existing?.shopifyGid) {
        const updated = await this.shopify.updateProduct(existing.shopifyGid, transformed.product, transformed.variant);
        shopifyGid = updated.id;
        action = "update";
      } else {
        const existingGid = await this.shopify.findExistingProduct(transformed.sku, transformed.product.title);
        if (existingGid) {
          const updated = await this.shopify.updateProduct(existingGid, transformed.product, transformed.variant);
          shopifyGid = updated.id;
          action = "update";
        } else {
          const created = await this.shopify.createProduct(transformed.product, transformed.variant);
          shopifyGid = created.id;
          action = "create";
        }
      }

      try {
        const stocks = await this.ps.list<{ id_product: string; quantity: string }>(
          "stock_availables",
          { display: "full", filter: { id_product: String(psId) } }
        );
        const totalStock = stocks.reduce((sum, s) => sum + parseInt(s.quantity || "0"), 0);
        await this.shopify.setInventory(shopifyGid, totalStock);
      } catch {
        // Stock sync failure is non-fatal
      }

      await (this.prisma as any).idMapping.upsert({
        where: { resourceType_psId: { resourceType: "product", psId } },
        create: { resourceType: "product", psId, shopifyGid, dataHash: hash, syncStatus: "synced" },
        update: { shopifyGid, dataHash: hash, lastSyncedAt: new Date(), syncStatus: "synced" },
      });

      await this.log(jobId, "product", psId, action);
      return { psId, action, shopifyGid };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await this.log(jobId, "product", psId, "error", { error: message });
    await this.enqueueRetry(jobId, "product", psId, message);
    return { psId, action: "error", error: message };
  }
}
```

Add the `enqueueRetry` private method at the bottom of the class:

```ts
private async enqueueRetry(jobId: string, resourceType: string, psId: number, error: string) {
  try {
    await (this.prisma as any).retryQueue.create({
      data: {
        jobId,
        resourceType,
        psId,
        lastError: error,
        status: "pending",
        attemptCount: 3, // Already failed 3 immediate retries
        nextRetryAt: computeDeferredNextRetry(4, new Date()),
      },
    });
  } catch {
    // Queue insertion failure is non-fatal — error is already logged
  }
}
```

Apply the same pattern to `syncSingleCustomer` and `syncSingleOrder` — wrap existing try body in `withImmediateRetry(async () => { ... })`, change catch to call `enqueueRetry`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/sync/engine.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/sync/engine.ts tests/lib/sync/engine.test.ts
git commit -m "feat: integrate immediate retry + retry queue into SyncEngine"
```

---

### Task 7: Deferred retry endpoint

**Files:**
- Create: `src/app/api/sync/retry/route.ts`
- Test: `tests/integration/retry-flow.test.ts`

- [ ] **Step 1: Write integration test**

```ts
// tests/integration/retry-flow.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDeferredNextRetry, DEFERRED_MAX_ATTEMPTS } from "@/lib/sync/retry";

describe("deferred retry flow", () => {
  it("computes escalating delays", () => {
    const now = new Date("2026-04-09T10:00:00Z");

    // Attempt 4 → 15 min
    const next4 = computeDeferredNextRetry(4, now);
    expect(next4.getTime() - now.getTime()).toBe(15 * 60 * 1000);

    // Attempt 7 → 1 hour
    const next7 = computeDeferredNextRetry(7, now);
    expect(next7.getTime() - now.getTime()).toBe(60 * 60 * 1000);

    // Attempt 9 → 4 hours
    const next9 = computeDeferredNextRetry(9, now);
    expect(next9.getTime() - now.getTime()).toBe(4 * 60 * 60 * 1000);
  });

  it("abandons after max attempts", () => {
    expect(DEFERRED_MAX_ATTEMPTS).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (it uses already-implemented logic)

Run: `npx vitest run tests/integration/retry-flow.test.ts`
Expected: PASS

- [ ] **Step 3: Create retry API endpoint**

```ts
// src/app/api/sync/retry/route.ts
import { NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import { shopify } from "@/lib/shopify/auth";
import { ShopifyClient } from "@/lib/shopify/client";
import { SyncEngine } from "@/lib/sync/engine";
import { prisma } from "@/lib/db";
import { computeDeferredNextRetry, DEFERRED_MAX_ATTEMPTS } from "@/lib/sync/retry";

export const maxDuration = 300;

export async function POST() {
  const now = new Date();
  const pending = await (prisma as any).retryQueue.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: 50,
  });

  if (pending.length === 0) {
    return NextResponse.json({ status: "no_pending", processed: 0 });
  }

  const session = await prisma.session.findFirst({
    where: { accessToken: { not: null } },
  });
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No Shopify session" }, { status: 401 });
  }

  const graphqlClient = new shopify.clients.Graphql({ session: session as any });
  const shopifyClient = new ShopifyClient(graphqlClient as any);
  const ps = getPSConnector();
  const engine = new SyncEngine(ps, shopifyClient, prisma);

  const results = { resolved: 0, retrying: 0, abandoned: 0 };

  for (const item of pending) {
    // Mark as retrying
    await (prisma as any).retryQueue.update({
      where: { id: item.id },
      data: { status: "retrying" },
    });

    let result;
    const retryJobId = `retry-${item.jobId}-${Date.now()}`;

    try {
      if (item.resourceType === "product") {
        result = await engine.syncSingleProduct(item.psId, retryJobId);
      } else if (item.resourceType === "customer") {
        result = await engine.syncSingleCustomer(item.psId, retryJobId);
      } else if (item.resourceType === "order") {
        result = await engine.syncSingleOrder(item.psId, retryJobId);
      }
    } catch {
      result = { action: "error" };
    }

    if (result && result.action !== "error") {
      // Success — resolve
      await (prisma as any).retryQueue.update({
        where: { id: item.id },
        data: { status: "resolved", updatedAt: new Date() },
      });
      results.resolved++;
    } else {
      const newAttemptCount = item.attemptCount + 1;
      if (newAttemptCount >= DEFERRED_MAX_ATTEMPTS) {
        await (prisma as any).retryQueue.update({
          where: { id: item.id },
          data: { status: "abandoned", attemptCount: newAttemptCount },
        });
        results.abandoned++;
      } else {
        await (prisma as any).retryQueue.update({
          where: { id: item.id },
          data: {
            status: "pending",
            attemptCount: newAttemptCount,
            lastError: result?.error ?? item.lastError,
            nextRetryAt: computeDeferredNextRetry(newAttemptCount, new Date()),
          },
        });
        results.retrying++;
      }
    }
  }

  return NextResponse.json({ status: "completed", ...results });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sync/retry/route.ts tests/integration/retry-flow.test.ts
git commit -m "feat: deferred retry endpoint with escalating backoff"
```

---

## Phase 3 — Cron Dispatcher

### Task 8: Cron dispatcher logic

**Files:**
- Create: `src/lib/cron/dispatcher.ts`
- Test: `tests/unit/cron/dispatcher.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/cron/dispatcher.test.ts
import { describe, it, expect, vi } from "vitest";
import { getScheduledResources } from "@/lib/cron/dispatcher";

describe("getScheduledResources", () => {
  it("returns resources whose nextRunAt is past", () => {
    const now = new Date("2026-04-09T12:00:00Z");
    const configs = [
      { resourceType: "products", enabled: true, nextRunAt: new Date("2026-04-09T11:00:00Z"), cronExpression: "0 */6 * * *" },
      { resourceType: "customers", enabled: true, nextRunAt: new Date("2026-04-09T13:00:00Z"), cronExpression: "0 7 * * *" },
      { resourceType: "orders", enabled: false, nextRunAt: new Date("2026-04-09T10:00:00Z"), cronExpression: "0 20 * * *" },
    ];

    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(1);
    expect(due[0].resourceType).toBe("products");
  });

  it("skips disabled resources even if overdue", () => {
    const now = new Date("2026-04-09T23:00:00Z");
    const configs = [
      { resourceType: "orders", enabled: false, nextRunAt: new Date("2026-04-09T10:00:00Z"), cronExpression: "0 20 * * *" },
    ];

    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(0);
  });

  it("includes resources with null nextRunAt (first run)", () => {
    const now = new Date("2026-04-09T12:00:00Z");
    const configs = [
      { resourceType: "inventory", enabled: true, nextRunAt: null, cronExpression: "0 */2 * * *" },
    ];

    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/cron/dispatcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement dispatcher**

```ts
// src/lib/cron/dispatcher.ts
import type { CronConfig } from "@prisma/client";

export interface ScheduledResource {
  resourceType: string;
  cronExpression: string;
}

/**
 * Filter CronConfig entries to find which resources are due for sync.
 * A resource is due if: enabled AND (nextRunAt is null OR nextRunAt <= now).
 */
export function getScheduledResources(
  configs: CronConfig[],
  now: Date
): ScheduledResource[] {
  return configs
    .filter((c) => c.enabled && (c.nextRunAt === null || c.nextRunAt <= now))
    .map((c) => ({ resourceType: c.resourceType, cronExpression: c.cronExpression }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cron/dispatcher.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cron/dispatcher.ts tests/unit/cron/dispatcher.test.ts
git commit -m "feat: cron dispatcher logic — filter due resources"
```

---

### Task 9: Cron dispatcher API endpoint

**Files:**
- Create: `src/app/api/sync/cron/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create cron endpoint**

```ts
// src/app/api/sync/cron/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getScheduledResources } from "@/lib/cron/dispatcher";
import { computeNextRun } from "@/lib/cron/schedule";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  // Verify Vercel Cron secret in production
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await (prisma as any).cronConfig.findMany();
  const now = new Date();
  const due = getScheduledResources(configs, now);
  const baseUrl = request.nextUrl.origin;
  const launched: string[] = [];

  for (const resource of due) {
    const jobId = `cron-${resource.resourceType}-${Date.now()}`;

    // Launch the sync in the background
    try {
      const syncUrl = resource.resourceType === "inventory"
        ? `${baseUrl}/api/sync?resourceType=products&jobId=${encodeURIComponent(jobId)}`
        : `${baseUrl}/api/sync?resourceType=${resource.resourceType}&jobId=${encodeURIComponent(jobId)}`;

      fetch(syncUrl, { method: "POST" }).catch(() => {});

      const nextRunAt = computeNextRun(resource.cronExpression, now);
      await (prisma as any).cronConfig.update({
        where: { resourceType: resource.resourceType },
        data: { lastRunAt: now, lastJobId: jobId, nextRunAt },
      });

      launched.push(resource.resourceType);
    } catch {
      // Log but continue with other resources
    }
  }

  // Also trigger retry processing
  try {
    fetch(`${baseUrl}/api/sync/retry`, { method: "POST" }).catch(() => {});
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ status: "dispatched", launched, checkedAt: now.toISOString() });
}
```

- [ ] **Step 2: Update vercel.json**

Replace content of `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/sync/cron",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sync/cron/route.ts vercel.json
git commit -m "feat: cron dispatcher endpoint — runs every 15min, dispatches due syncs"
```

---

### Task 10: Cron settings API routes

**Files:**
- Create: `src/app/api/settings/cron/route.ts`
- Create: `src/app/api/settings/cron/[resourceType]/route.ts`

- [ ] **Step 1: Create GET all configs route**

```ts
// src/app/api/settings/cron/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const configs = await (prisma as any).cronConfig.findMany({
    orderBy: { resourceType: "asc" },
  });
  return NextResponse.json(configs);
}
```

- [ ] **Step 2: Create PUT + POST per-resource route**

```ts
// src/app/api/settings/cron/[resourceType]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeNextRun } from "@/lib/cron/schedule";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resourceType: string }> }
) {
  const { resourceType } = await params;
  const body = await request.json();
  const { cronExpression, enabled } = body;

  const data: Record<string, unknown> = {};
  if (cronExpression !== undefined) data.cronExpression = cronExpression;
  if (enabled !== undefined) data.enabled = enabled;

  // Recompute nextRunAt if expression or enabled changed
  if (cronExpression || enabled !== undefined) {
    const current = await (prisma as any).cronConfig.findUnique({
      where: { resourceType },
    });
    if (current) {
      const expr = cronExpression ?? current.cronExpression;
      const isEnabled = enabled ?? current.enabled;
      data.nextRunAt = isEnabled ? computeNextRun(expr, new Date()) : null;
    }
  }

  const updated = await (prisma as any).cronConfig.update({
    where: { resourceType },
    data,
  });

  return NextResponse.json(updated);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resourceType: string }> }
) {
  const { resourceType } = await params;
  const baseUrl = request.nextUrl.origin;
  const jobId = `manual-${resourceType}-${Date.now()}`;

  const syncResourceType = resourceType === "inventory" ? "products" : resourceType;
  const syncUrl = `${baseUrl}/api/sync?resourceType=${syncResourceType}&jobId=${encodeURIComponent(jobId)}`;

  fetch(syncUrl, { method: "POST" }).catch(() => {});

  await (prisma as any).cronConfig.update({
    where: { resourceType },
    data: { lastRunAt: new Date(), lastJobId: jobId },
  });

  return NextResponse.json({ status: "launched", jobId });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/settings/cron/
git commit -m "feat: cron settings API — GET all, PUT config, POST run now"
```

---

### Task 11: Record SyncStats in sync route

**Files:**
- Modify: `src/app/api/sync/route.ts`

- [ ] **Step 1: Add stat recording to sync route**

In `src/app/api/sync/route.ts`, add import at top:
```ts
import { recordSyncStats } from "@/lib/sync/stats";
```

After processing results (after the `for` loop around line 43), before the batch completion check, add:

```ts
// Aggregate results for stats
const counts = {
  created: results.filter((r) => r.action === "create").length,
  updated: results.filter((r) => r.action === "update").length,
  skipped: results.filter((r) => r.action === "skip").length,
  errors: results.filter((r) => r.action === "error").length,
  durationMs: Date.now() - startTime,
};

const singularType = resourceType.replace(/s$/, "");
await recordSyncStats(prisma, singularType, counts).catch(() => {});
```

Also add `const startTime = Date.now();` right after the resourceType validation (around line 18).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/sync/route.ts
git commit -m "feat: record SyncStats after each batch"
```

---

## Phase 4 — Dashboard

### Task 12: Install Recharts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install recharts**

Run: `npx shadcn@latest add chart`

If that fails, run: `npm install recharts`

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json src/components/ui/chart.tsx 2>/dev/null; git commit -m "feat: add Recharts (via shadcn chart component)"
```

---

### Task 13: Retry queue API for dashboard

**Files:**
- Create: `src/app/api/retry/route.ts`

- [ ] **Step 1: Create retry queue read endpoint**

```ts
// src/app/api/retry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status"); // pending | abandoned | all
  const resourceType = searchParams.get("resourceType");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (resourceType) where.resourceType = resourceType;

  const [items, total, pendingCount, abandonedCount] = await Promise.all([
    (prisma as any).retryQueue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    (prisma as any).retryQueue.count({ where }),
    (prisma as any).retryQueue.count({ where: { status: "pending" } }),
    (prisma as any).retryQueue.count({ where: { status: "abandoned" } }),
  ]);

  return NextResponse.json({ items, total, pendingCount, abandonedCount, limit, offset });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, action } = body; // action: "retry" | "dismiss"

  if (action === "retry") {
    await (prisma as any).retryQueue.update({
      where: { id },
      data: { status: "pending", nextRetryAt: new Date() },
    });
  } else if (action === "dismiss") {
    await (prisma as any).retryQueue.update({
      where: { id },
      data: { status: "abandoned" },
    });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/retry/route.ts
git commit -m "feat: retry queue API — list, retry, dismiss"
```

---

### Task 14: Stats API for charts

**Files:**
- Create: `src/app/api/stats/route.ts`

- [ ] **Step 1: Create stats endpoint**

```ts
// src/app/api/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const days = parseInt(searchParams.get("days") ?? "7");
  const resourceType = searchParams.get("resourceType"); // optional filter

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const where: Record<string, unknown> = { date: { gte: since } };
  if (resourceType) where.resourceType = resourceType;

  const stats = await (prisma as any).syncStat.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json(stats);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/stats/route.ts
git commit -m "feat: stats API for dashboard charts"
```

---

### Task 15: Filter bar component

**Files:**
- Create: `src/components/dashboard/filter-bar.tsx`

- [ ] **Step 1: Create shared filter bar**

```tsx
// src/components/dashboard/filter-bar.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FilterBarProps {
  onFilter: (filters: FilterState) => void;
  showResourceType?: boolean;
  showStatus?: boolean;
}

export interface FilterState {
  dateRange: string; // "today" | "7d" | "30d" | "custom"
  resourceType: string; // "all" | "product" | "customer" | "order"
  status: string; // "all" | "create" | "update" | "skip" | "error"
  search: string;
}

const DATE_PRESETS = [
  { label: "Aujourd'hui", value: "today" },
  { label: "7j", value: "7d" },
  { label: "30j", value: "30d" },
];

export function FilterBar({ onFilter, showResourceType = true, showStatus = true }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    dateRange: "7d",
    resourceType: "all",
    status: "all",
    search: "",
  });

  function update(patch: Partial<FilterState>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    onFilter(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div className="flex gap-1">
        {DATE_PRESETS.map((p) => (
          <Button
            key={p.value}
            variant={filters.dateRange === p.value ? "default" : "outline"}
            size="sm"
            onClick={() => update({ dateRange: p.value })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {showResourceType && (
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.resourceType}
          onChange={(e) => update({ resourceType: e.target.value })}
        >
          <option value="all">Tous types</option>
          <option value="product">Produits</option>
          <option value="customer">Clients</option>
          <option value="order">Commandes</option>
        </select>
      )}

      {showStatus && (
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filters.status}
          onChange={(e) => update({ status: e.target.value })}
        >
          <option value="all">Tous statuts</option>
          <option value="create">Créé</option>
          <option value="update">Mis à jour</option>
          <option value="skip">Ignoré</option>
          <option value="error">Erreur</option>
        </select>
      )}

      <Input
        placeholder="Rechercher jobId, psId..."
        className="w-48"
        value={filters.search}
        onChange={(e) => update({ search: e.target.value })}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/filter-bar.tsx
git commit -m "feat: shared filter bar component for dashboard"
```

---

### Task 16: KPI cards component

**Files:**
- Create: `src/components/dashboard/kpi-cards.tsx`

- [ ] **Step 1: Create KPI cards**

```tsx
// src/components/dashboard/kpi-cards.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface KPICardsProps {
  totalSynced: number;
  products: number;
  customers: number;
  orders: number;
  errors24h: number;
}

export function KPICards({ totalSynced, products, customers, orders, errors24h }: KPICardsProps) {
  const cards = [
    { title: "Total synchronisé", value: totalSynced },
    { title: "Produits", value: products },
    { title: "Clients", value: customers },
    { title: "Commandes", value: orders },
    { title: "Erreurs (24h)", value: errors24h, isError: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.title} size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{card.value}</span>
              {card.isError && card.value > 0 && (
                <Badge variant="destructive">{card.value}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/kpi-cards.tsx
git commit -m "feat: KPI cards component for overview"
```

---

### Task 17: Sync chart component (Recharts)

**Files:**
- Create: `src/components/dashboard/sync-chart.tsx`

- [ ] **Step 1: Create chart component**

```tsx
// src/components/dashboard/sync-chart.tsx
"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SyncStat {
  date: string;
  resourceType: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

interface ChartData {
  date: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export function SyncChart() {
  const [days, setDays] = useState(7);
  const [resourceType, setResourceType] = useState<string | null>(null);
  const [data, setData] = useState<ChartData[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (resourceType) params.set("resourceType", resourceType);

    fetch(`/api/stats?${params}`)
      .then((r) => r.json())
      .then((stats: SyncStat[]) => {
        // Group by date
        const byDate = new Map<string, ChartData>();
        for (const s of stats) {
          const dateKey = s.date.slice(0, 10);
          const existing = byDate.get(dateKey) ?? { date: dateKey, created: 0, updated: 0, skipped: 0, errors: 0 };
          existing.created += s.created;
          existing.updated += s.updated;
          existing.skipped += s.skipped;
          existing.errors += s.errors;
          byDate.set(dateKey, existing);
        }
        setData(Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)));
      });
  }, [days, resourceType]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Activité de synchronisation</CardTitle>
        <div className="flex gap-2">
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
                {d}j
              </Button>
            ))}
          </div>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={resourceType ?? ""}
            onChange={(e) => setResourceType(e.target.value || null)}
          >
            <option value="">Tous</option>
            <option value="product">Produits</option>
            <option value="customer">Clients</option>
            <option value="order">Commandes</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={(d) => new Date(d).toLocaleDateString("fr-CA", { month: "short", day: "numeric" })} />
            <YAxis />
            <Tooltip labelFormatter={(d) => new Date(d).toLocaleDateString("fr-CA")} />
            <Legend />
            <Area type="monotone" dataKey="created" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} name="Créés" />
            <Area type="monotone" dataKey="updated" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Mis à jour" />
            <Area type="monotone" dataKey="skipped" stackId="1" stroke="#a1a1aa" fill="#a1a1aa" fillOpacity={0.3} name="Ignorés" />
            <Area type="monotone" dataKey="errors" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Erreurs" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/sync-chart.tsx
git commit -m "feat: Recharts AreaChart for sync activity trends"
```

---

### Task 18: Scheduled syncs + retry summary components

**Files:**
- Create: `src/components/dashboard/scheduled-syncs.tsx`
- Create: `src/components/dashboard/retry-summary.tsx`

- [ ] **Step 1: Create scheduled syncs component**

```tsx
// src/components/dashboard/scheduled-syncs.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cronToLabel } from "@/lib/cron/schedule";

interface CronConfigItem {
  resourceType: string;
  enabled: boolean;
  cronExpression: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastJobId: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  products: "Produits",
  inventory: "Inventaire",
  customers: "Clients",
  orders: "Commandes",
};

export function ScheduledSyncs() {
  const [configs, setConfigs] = useState<CronConfigItem[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/cron").then((r) => r.json()).then(setConfigs);
  }, []);

  async function runNow(resourceType: string) {
    setRunning(resourceType);
    await fetch(`/api/settings/cron/${resourceType}`, { method: "POST" });
    setRunning(null);
    // Refresh
    const updated = await fetch("/api/settings/cron").then((r) => r.json());
    setConfigs(updated);
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Syncs programmés</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2">Ressource</th>
              <th className="pb-2">Fréquence</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2">Dernier run</th>
              <th className="pb-2">Prochain</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.resourceType} className="border-t">
                <td className="py-2">{RESOURCE_LABELS[c.resourceType] ?? c.resourceType}</td>
                <td>{cronToLabel(c.cronExpression)}</td>
                <td>
                  <Badge variant={c.enabled ? "default" : "secondary"}>
                    {c.enabled ? "Actif" : "Inactif"}
                  </Badge>
                </td>
                <td>{formatDate(c.lastRunAt)}</td>
                <td>{c.enabled ? formatDate(c.nextRunAt) : "—"}</td>
                <td>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={running === c.resourceType}
                    onClick={() => runNow(c.resourceType)}
                  >
                    {running === c.resourceType ? "..." : "Run now"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create retry summary component**

```tsx
// src/components/dashboard/retry-summary.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

interface RetryData {
  pendingCount: number;
  abandonedCount: number;
  items: {
    id: string;
    resourceType: string;
    psId: number;
    lastError: string;
    status: string;
    attemptCount: number;
  }[];
}

export function RetrySummary() {
  const [data, setData] = useState<RetryData | null>(null);

  useEffect(() => {
    fetch("/api/retry?limit=5&status=pending")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>File de retry</CardTitle>
        <Link href="/retry" className="text-sm text-blue-500 hover:underline">
          Voir tout
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">En attente:</span>
            <Badge variant={data.pendingCount > 0 ? "destructive" : "secondary"}>
              {data.pendingCount}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Abandonnés:</span>
            <Badge variant="secondary">{data.abandonedCount}</Badge>
          </div>
        </div>

        {data.items.length > 0 && (
          <div className="space-y-2">
            {data.items.map((item) => (
              <div key={item.id} className="text-xs border rounded p-2">
                <div className="flex justify-between">
                  <span className="font-mono">{item.resourceType} #{item.psId}</span>
                  <span className="text-muted-foreground">x{item.attemptCount}</span>
                </div>
                <p className="text-red-500 truncate">{item.lastError}</p>
              </div>
            ))}
          </div>
        )}

        {data.pendingCount === 0 && data.abandonedCount === 0 && (
          <p className="text-sm text-muted-foreground">Aucun item en retry</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/scheduled-syncs.tsx src/components/dashboard/retry-summary.tsx
git commit -m "feat: scheduled syncs + retry summary dashboard components"
```

---

### Task 19: Retry badge in sidebar

**Files:**
- Create: `src/components/dashboard/retry-badge.tsx`
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create retry badge**

```tsx
// src/components/dashboard/retry-badge.tsx
"use client";

import { useState, useEffect } from "react";

export function RetryBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    function fetchCount() {
      fetch("/api/retry?limit=0")
        .then((r) => r.json())
        .then((d) => setCount(d.pendingCount ?? 0))
        .catch(() => {});
    }

    fetchCount();
    const interval = setInterval(fetchCount, 60_000);
    return () => clearInterval(interval);
  }, []);

  if (count === 0) return null;

  return (
    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}
```

- [ ] **Step 2: Add /retry to sidebar nav and integrate badge**

In `src/components/layout/sidebar.tsx`, add to the navigation array (after Logs entry):

```ts
{ href: "/retry", label: "Retry", icon: "RotateCcw" },
```

And import + render `<RetryBadge />` next to the Retry nav item. The exact modification depends on the sidebar structure — place the badge component inside the nav item for "Retry".

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/retry-badge.tsx src/components/layout/sidebar.tsx
git commit -m "feat: retry badge in sidebar with live pending count"
```

---

### Task 20: Refonte Overview page

**Files:**
- Modify: `src/app/(dashboard)/page.tsx` (full rewrite)

- [ ] **Step 1: Read current overview page**

Read `src/app/(dashboard)/page.tsx` to understand current structure.

- [ ] **Step 2: Rewrite overview page**

```tsx
// src/app/(dashboard)/page.tsx
import { prisma } from "@/lib/db";
import { KPICards } from "@/components/dashboard/kpi-cards";
import { SyncChart } from "@/components/dashboard/sync-chart";
import { ScheduledSyncs } from "@/components/dashboard/scheduled-syncs";
import { RetrySummary } from "@/components/dashboard/retry-summary";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    totalProducts,
    totalCustomers,
    totalOrders,
    totalSynced,
    errors24h,
    recentLogs,
  ] = await Promise.all([
    (prisma as any).idMapping.count({ where: { resourceType: "product", syncStatus: "synced" } }),
    (prisma as any).idMapping.count({ where: { resourceType: "customer", syncStatus: "synced" } }),
    (prisma as any).idMapping.count({ where: { resourceType: "order", syncStatus: "synced" } }),
    (prisma as any).idMapping.count({ where: { syncStatus: "synced" } }),
    (prisma as any).syncLog.count({ where: { action: "error", createdAt: { gte: yesterday } } }),
    (prisma as any).syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Vue d&apos;ensemble</h1>

      <KPICards
        totalSynced={totalSynced}
        products={totalProducts}
        customers={totalCustomers}
        orders={totalOrders}
        errors24h={errors24h}
      />

      <SyncChart />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ScheduledSyncs />
        <RetrySummary />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Activité récente</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="pb-2">Job</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">PS ID</th>
              <th className="pb-2">Action</th>
              <th className="pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log: any) => (
              <tr key={log.id} className="border-b">
                <td className="py-2 font-mono text-xs">{log.jobId?.slice(0, 8)}...</td>
                <td>{log.resourceType}</td>
                <td>{log.psId}</td>
                <td>
                  <span className={
                    log.action === "error" ? "text-red-500" :
                    log.action === "create" ? "text-green-500" :
                    log.action === "update" ? "text-blue-500" :
                    "text-muted-foreground"
                  }>
                    {log.action}
                  </span>
                </td>
                <td className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString("fr-CA")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat: refonte overview — KPIs, chart, scheduled syncs, retry summary"
```

---

### Task 21: Retry page

**Files:**
- Create: `src/app/(dashboard)/retry/page.tsx`

- [ ] **Step 1: Create retry page**

```tsx
// src/app/(dashboard)/retry/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RetryItem {
  id: string;
  jobId: string;
  resourceType: string;
  psId: number;
  attemptCount: number;
  lastError: string;
  status: string;
  nextRetryAt: string;
  createdAt: string;
}

export default function RetryPage() {
  const [items, setItems] = useState<RetryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    fetch(`/api/retry?status=${statusFilter}&limit=${limit}&offset=${offset}`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items);
        setTotal(d.total);
      });
  }, [statusFilter, offset]);

  async function handleAction(id: string, action: "retry" | "dismiss") {
    await fetch("/api/retry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    // Refresh
    const r = await fetch(`/api/retry?status=${statusFilter}&limit=${limit}&offset=${offset}`);
    const d = await r.json();
    setItems(d.items);
    setTotal(d.total);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">File de retry</h1>

      <div className="flex gap-2">
        {["pending", "abandoned", "all"].map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => { setStatusFilter(s); setOffset(0); }}
          >
            {s === "pending" ? "En attente" : s === "abandoned" ? "Abandonnés" : "Tous"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">{total} item(s)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2">Type</th>
                <th className="pb-2">PS ID</th>
                <th className="pb-2">Tentatives</th>
                <th className="pb-2">Erreur</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2">Prochain retry</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2">{item.resourceType}</td>
                  <td className="font-mono">{item.psId}</td>
                  <td>{item.attemptCount}</td>
                  <td className="text-red-500 max-w-xs truncate">{item.lastError}</td>
                  <td>
                    <Badge variant={item.status === "pending" ? "default" : "secondary"}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="text-muted-foreground text-xs">
                    {new Date(item.nextRetryAt).toLocaleString("fr-CA")}
                  </td>
                  <td className="flex gap-1">
                    {item.status !== "resolved" && (
                      <>
                        <Button size="xs" variant="outline" onClick={() => handleAction(item.id, "retry")}>
                          Retry
                        </Button>
                        {item.status === "pending" && (
                          <Button size="xs" variant="ghost" onClick={() => handleAction(item.id, "dismiss")}>
                            Ignorer
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {total > limit && (
            <div className="flex gap-2 mt-4 justify-center">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(offset - limit)}>
                Précédent
              </Button>
              <Button size="sm" variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/retry/page.tsx
git commit -m "feat: retry queue page with filters, retry/dismiss actions"
```

---

### Task 22: Settings page — cron configuration

**Files:**
- Modify: `src/app/(dashboard)/settings/page.tsx`

- [ ] **Step 1: Read current settings page**

Read `src/app/(dashboard)/settings/page.tsx`.

- [ ] **Step 2: Rewrite settings page with cron config**

```tsx
// src/app/(dashboard)/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FREQUENCY_PRESETS } from "@/lib/cron/schedule";

interface CronConfigItem {
  resourceType: string;
  enabled: boolean;
  cronExpression: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastJobId: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  products: "Produits",
  inventory: "Inventaire",
  customers: "Clients",
  orders: "Commandes",
};

export default function SettingsPage() {
  const [configs, setConfigs] = useState<CronConfigItem[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/cron").then((r) => r.json()).then(setConfigs);
  }, []);

  async function toggleEnabled(resourceType: string, enabled: boolean) {
    setSaving(resourceType);
    await fetch(`/api/settings/cron/${resourceType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const updated = await fetch("/api/settings/cron").then((r) => r.json());
    setConfigs(updated);
    setSaving(null);
  }

  async function changeFrequency(resourceType: string, cronExpression: string) {
    setSaving(resourceType);
    await fetch(`/api/settings/cron/${resourceType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cronExpression }),
    });
    const updated = await fetch("/api/settings/cron").then((r) => r.json());
    setConfigs(updated);
    setSaving(null);
  }

  async function runNow(resourceType: string) {
    setSaving(resourceType);
    const res = await fetch(`/api/settings/cron/${resourceType}`, { method: "POST" });
    const data = await res.json();
    setSaving(null);
    if (data.jobId) {
      window.location.href = `/sync/${data.jobId}`;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("fr-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Configuration</h1>

      <Card>
        <CardHeader>
          <CardTitle>Planification des syncs</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="pb-2">Ressource</th>
                <th className="pb-2">Fréquence</th>
                <th className="pb-2">Actif</th>
                <th className="pb-2">Dernier run</th>
                <th className="pb-2">Prochain</th>
                <th className="pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {configs.map((c) => (
                <tr key={c.resourceType} className="border-t">
                  <td className="py-3 font-medium">{RESOURCE_LABELS[c.resourceType] ?? c.resourceType}</td>
                  <td>
                    <select
                      className="border rounded px-2 py-1 text-sm"
                      value={c.cronExpression}
                      onChange={(e) => changeFrequency(c.resourceType, e.target.value)}
                      disabled={saving === c.resourceType}
                    >
                      {FREQUENCY_PRESETS.map((p) => (
                        <option key={p.cron} value={p.cron}>{p.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="cursor-pointer"
                      onClick={() => toggleEnabled(c.resourceType, !c.enabled)}
                      disabled={saving === c.resourceType}
                    >
                      <Badge variant={c.enabled ? "default" : "secondary"}>
                        {c.enabled ? "Actif" : "Inactif"}
                      </Badge>
                    </button>
                  </td>
                  <td className="text-muted-foreground">{formatDate(c.lastRunAt)}</td>
                  <td className="text-muted-foreground">{c.enabled ? formatDate(c.nextRunAt) : "—"}</td>
                  <td>
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={saving === c.resourceType}
                      onClick={() => runNow(c.resourceType)}
                    >
                      Run now
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connexions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-medium">Shopify</p>
            <p className="text-sm text-muted-foreground">maison-du-savon-ca.myshopify.com</p>
          </div>
          <div>
            <p className="text-sm font-medium">PrestaShop</p>
            <p className="text-sm text-muted-foreground">Configuré via variables d&apos;environnement</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: settings page with cron config table"
```

---

### Task 23: Add filters to logs page

**Files:**
- Modify: `src/app/(dashboard)/logs/page.tsx`

- [ ] **Step 1: Read current logs page**

Read `src/app/(dashboard)/logs/page.tsx`.

- [ ] **Step 2: Convert to client component with filters**

Rewrite `src/app/(dashboard)/logs/page.tsx` to be a client component that uses `FilterBar` and fetches from `/api/logs` with filter params. The current page fetches server-side — switch to client-side fetching with filter state.

Key changes:
- Add `"use client"` at top
- Import and render `FilterBar`
- Use `useState` + `useEffect` to fetch `/api/logs?jobId=...&resourceType=...&action=...&limit=100`
- Convert `FilterState.dateRange` to a `since` date query param
- Keep the existing table structure

- [ ] **Step 3: Apply same pattern to mapping page**

Convert `src/app/(dashboard)/mapping/page.tsx` similarly — client component with `FilterBar`, fetching from a new `/api/mapping` endpoint or inline filtering.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/logs/page.tsx src/app/\(dashboard\)/mapping/page.tsx
git commit -m "feat: add filter bar to logs and mapping pages"
```

---

## Phase 5 — E2E Tests

### Task 24: Setup Playwright

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Playwright**

Run: `npm install -D @playwright/test && npx playwright install chromium`

- [ ] **Step 2: Create config**

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

Add to `scripts`:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts package.json package-lock.json
git commit -m "feat: setup Playwright for E2E testing"
```

---

### Task 25: E2E — Overview page

**Files:**
- Create: `tests/e2e/overview.spec.ts`

- [ ] **Step 1: Write E2E test**

```ts
// tests/e2e/overview.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Overview page", () => {
  test("displays KPI cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Total synchronisé")).toBeVisible();
    await expect(page.getByText("Produits")).toBeVisible();
    await expect(page.getByText("Clients")).toBeVisible();
    await expect(page.getByText("Commandes")).toBeVisible();
    await expect(page.getByText("Erreurs (24h)")).toBeVisible();
  });

  test("displays sync chart", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Activité de synchronisation")).toBeVisible();
  });

  test("displays scheduled syncs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Syncs programmés")).toBeVisible();
  });

  test("displays recent activity", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Activité récente")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test** (will need dev server running)

Run: `npx playwright test tests/e2e/overview.spec.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/overview.spec.ts
git commit -m "test: E2E overview page — KPIs, chart, scheduled syncs"
```

---

### Task 26: E2E — Settings page

**Files:**
- Create: `tests/e2e/settings.spec.ts`

- [ ] **Step 1: Write E2E test**

```ts
// tests/e2e/settings.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test("displays cron config table", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Planification des syncs")).toBeVisible();
    await expect(page.getByText("Produits")).toBeVisible();
    await expect(page.getByText("Clients")).toBeVisible();
  });

  test("can toggle cron enabled/disabled", async ({ page }) => {
    await page.goto("/settings");
    const badge = page.getByText("Actif").first();
    await badge.click();
    // Should toggle to "Inactif"
    await expect(page.getByText("Inactif").first()).toBeVisible();
  });

  test("shows frequency selector", async ({ page }) => {
    await page.goto("/settings");
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/settings.spec.ts
git commit -m "test: E2E settings page — cron config toggle and frequency"
```

---

### Task 27: E2E — Logs and Retry pages

**Files:**
- Create: `tests/e2e/logs.spec.ts`
- Create: `tests/e2e/retry.spec.ts`

- [ ] **Step 1: Write logs E2E test**

```ts
// tests/e2e/logs.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Logs page", () => {
  test("displays filter bar", async ({ page }) => {
    await page.goto("/logs");
    await expect(page.getByText("7j")).toBeVisible();
    await expect(page.getByPlaceholder("Rechercher")).toBeVisible();
  });

  test("date range filter buttons work", async ({ page }) => {
    await page.goto("/logs");
    await page.getByText("30j").click();
    // Filter should be active
    await expect(page.getByText("30j")).toHaveClass(/default/);
  });
});
```

- [ ] **Step 2: Write retry E2E test**

```ts
// tests/e2e/retry.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Retry page", () => {
  test("displays retry queue", async ({ page }) => {
    await page.goto("/retry");
    await expect(page.getByText("File de retry")).toBeVisible();
  });

  test("filter buttons work", async ({ page }) => {
    await page.goto("/retry");
    await expect(page.getByText("En attente")).toBeVisible();
    await expect(page.getByText("Abandonnés")).toBeVisible();
    await expect(page.getByText("Tous")).toBeVisible();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/logs.spec.ts tests/e2e/retry.spec.ts
git commit -m "test: E2E logs and retry pages"
```

---

## Phase 6 — Integration Tests & Stabilisation

### Task 28: Integration test — sync flow with stats

**Files:**
- Create: `tests/integration/sync-flow.test.ts`

- [ ] **Step 1: Write integration test**

```ts
// tests/integration/sync-flow.test.ts
import { describe, it, expect, vi } from "vitest";
import { SyncEngine } from "@/lib/sync/engine";

describe("sync flow integration", () => {
  it("creates product and records result", async () => {
    const mockPs = {
      get: vi.fn().mockResolvedValue({
        id: 42,
        name: [{ id: "1", value: "Savon Lavande" }],
        description: [{ id: "1", value: "<p>Lavender soap</p>" }],
        description_short: [],
        meta_title: [],
        meta_description: [],
        link_rewrite: [{ id: "1", value: "savon-lavande" }],
        reference: "SAV-LAV-001",
        ean13: "3700000000001",
        price: "12.50",
        active: "1",
        id_tax_rules_group: "1",
        weight: "0.100",
        id_category_default: "3",
        id_default_image: "0",
        associations: {},
      }),
      list: vi.fn().mockResolvedValue([{ id_product: "42", quantity: "15" }]),
    };

    const mockShopify = {
      findExistingProduct: vi.fn().mockResolvedValue(null),
      createProduct: vi.fn().mockResolvedValue({ id: "gid://shopify/Product/100" }),
      setInventory: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      idMapping: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      syncLog: { create: vi.fn().mockResolvedValue({}) },
      retryQueue: { create: vi.fn().mockResolvedValue({}) },
    };

    const engine = new SyncEngine(mockPs as any, mockShopify as any, mockPrisma as any);
    const result = await engine.syncSingleProduct(42, "test-job");

    expect(result.action).toBe("create");
    expect(result.shopifyGid).toBe("gid://shopify/Product/100");
    expect(mockShopify.createProduct).toHaveBeenCalledTimes(1);
    expect(mockPrisma.idMapping.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.syncLog.create).toHaveBeenCalled();
  });

  it("queues to retry after 3 failures", async () => {
    const mockPs = {
      get: vi.fn().mockRejectedValue(new Error("PS API timeout")),
    };

    const mockPrisma = {
      idMapping: { findUnique: vi.fn() },
      syncLog: { create: vi.fn().mockResolvedValue({}) },
      retryQueue: { create: vi.fn().mockResolvedValue({}) },
    };

    const engine = new SyncEngine(mockPs as any, {} as any, mockPrisma as any);
    const result = await engine.syncSingleProduct(42, "test-job");

    expect(result.action).toBe("error");
    expect(mockPs.get).toHaveBeenCalledTimes(3); // 3 immediate retries
    expect(mockPrisma.retryQueue.create).toHaveBeenCalledTimes(1);

    const retryData = mockPrisma.retryQueue.create.mock.calls[0][0].data;
    expect(retryData.status).toBe("pending");
    expect(retryData.attemptCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/integration/sync-flow.test.ts`
Expected: All PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/sync-flow.test.ts
git commit -m "test: integration tests for sync flow with retry queuing"
```

---

### Task 29: Integration test — cron dispatch

**Files:**
- Create: `tests/integration/cron-dispatch.test.ts`

- [ ] **Step 1: Write cron dispatch integration test**

```ts
// tests/integration/cron-dispatch.test.ts
import { describe, it, expect } from "vitest";
import { getScheduledResources } from "@/lib/cron/dispatcher";
import { computeNextRun } from "@/lib/cron/schedule";

describe("cron dispatch integration", () => {
  it("full cycle: detect due → compute next run", () => {
    const now = new Date("2026-04-09T12:05:00Z");

    const configs = [
      {
        id: "1",
        resourceType: "products",
        enabled: true,
        cronExpression: "0 */6 * * *",
        lastRunAt: new Date("2026-04-09T06:00:00Z"),
        nextRunAt: new Date("2026-04-09T12:00:00Z"),
        lastJobId: null,
      },
      {
        id: "2",
        resourceType: "customers",
        enabled: true,
        cronExpression: "0 7 * * *",
        lastRunAt: new Date("2026-04-09T07:00:00Z"),
        nextRunAt: new Date("2026-04-10T07:00:00Z"),
        lastJobId: null,
      },
    ];

    // Products is due, customers is not
    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(1);
    expect(due[0].resourceType).toBe("products");

    // Compute next run for products
    const nextRun = computeNextRun("0 */6 * * *", now);
    expect(nextRun).toEqual(new Date("2026-04-09T18:00:00Z"));
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/integration/cron-dispatch.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cron-dispatch.test.ts
git commit -m "test: integration test for cron dispatch cycle"
```

---

### Task 30: Move existing tests to unit/ directory

**Files:**
- Move: `tests/lib/` → `tests/unit/`

- [ ] **Step 1: Reorganize test files**

```bash
mkdir -p tests/unit
mv tests/lib/* tests/unit/
rmdir tests/lib
```

- [ ] **Step 2: Verify all tests still pass**

Run: `npx vitest run`
Expected: All existing tests PASS from new locations

- [ ] **Step 3: Commit**

```bash
git add tests/
git commit -m "refactor: move tests to unit/ directory structure"
```

---

### Task 31: Final verification

- [ ] **Step 1: Run all unit + integration tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit any fixes**

If any issues found, fix and commit with descriptive message.
