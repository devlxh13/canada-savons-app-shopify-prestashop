// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @/lib/db before importing the route so the route picks up the stub.
// Use vi.hoisted so these refs exist when the hoisted vi.mock factory runs.
const { findManyMock, updateMock, FIXED_NEXT_RUN } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  updateMock: vi.fn(),
  FIXED_NEXT_RUN: new Date("2026-04-11T13:00:00.000Z"),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    cronConfig: {
      findMany: findManyMock,
      update: updateMock,
    },
  },
}));

// Freeze computeNextRun so we can assert its value flows into cronConfig.update.
vi.mock("@/lib/cron/schedule", () => ({
  computeNextRun: vi.fn(() => FIXED_NEXT_RUN),
}));

import { GET } from "@/app/api/sync/cron/route";
import type { NextRequest } from "next/server";

function makeRequest(options: { authHeader?: string; url?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.authHeader) headers.set("authorization", options.authHeader);
  const url = options.url ?? "https://gateway.example.com/api/sync/cron";
  // NextRequest accepts a plain Request shape when passed through the app router.
  // The route only reads `.headers.get("authorization")` and `.nextUrl.origin`.
  // A minimal stub satisfies both without pulling in the real NextRequest constructor,
  // which requires internal Next.js runtime hooks not available under vitest.
  return {
    headers,
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

describe("GET /api/sync/cron", () => {
  const originalCronSecret = process.env.CRON_SECRET;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    findManyMock.mockReset();
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalCronSecret;
    }
  });

  describe("auth branches", () => {
    it("returns 401 when CRON_SECRET is set and Authorization header is missing", async () => {
      process.env.CRON_SECRET = "top-secret";
      findManyMock.mockResolvedValue([]);

      const res = await GET(makeRequest());

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it("returns 401 when CRON_SECRET is set and Bearer token is wrong", async () => {
      process.env.CRON_SECRET = "top-secret";
      findManyMock.mockResolvedValue([]);

      const res = await GET(makeRequest({ authHeader: "Bearer wrong" }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: "Unauthorized" });
      expect(findManyMock).not.toHaveBeenCalled();
    });

    it("returns 200 with a dispatched body when the correct Bearer CRON_SECRET is supplied", async () => {
      process.env.CRON_SECRET = "top-secret";
      findManyMock.mockResolvedValue([]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("dispatched");
      expect(Array.isArray(body.launched)).toBe(true);
      expect(typeof body.checkedAt).toBe("string");
    });

    // TODO: should fail closed (LXH-270 follow-up) — current production code
    // bypasses the auth check entirely when CRON_SECRET is unset, which is a
    // fail-open posture. This test documents the CURRENT behavior so a future
    // fix to fail closed will trip it and force an intentional update.
    it("FAIL-OPEN: bypasses auth when CRON_SECRET env is unset (current behavior)", async () => {
      delete process.env.CRON_SECRET;
      findManyMock.mockResolvedValue([]);

      // No authHeader at all — should still succeed under current code.
      const res = await GET(makeRequest());

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("dispatched");
      expect(body.launched).toEqual([]);
    });
  });

  describe("dispatch logic", () => {
    beforeEach(() => {
      process.env.CRON_SECRET = "top-secret";
    });

    it("returns empty launched when cronConfig.findMany returns 0 rows", async () => {
      findManyMock.mockResolvedValue([]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toEqual([]);
      expect(updateMock).not.toHaveBeenCalled();
      // Only the retry-processing fetch should have fired, no sync fetches.
      const syncCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes("/api/sync?")
      );
      expect(syncCalls).toHaveLength(0);
    });

    it("returns empty launched when all rows are disabled", async () => {
      findManyMock.mockResolvedValue([
        {
          resourceType: "products",
          enabled: false,
          cronExpression: "*/15 * * * *",
          nextRunAt: new Date("2000-01-01T00:00:00Z"),
        },
        {
          resourceType: "customers",
          enabled: false,
          cronExpression: "0 * * * *",
          nextRunAt: null,
        },
      ]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toEqual([]);
      expect(updateMock).not.toHaveBeenCalled();
      const syncCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes("/api/sync?")
      );
      expect(syncCalls).toHaveLength(0);
    });

    it("dispatches a due row, POSTs to /api/sync with the correct URL, and updates cronConfig", async () => {
      findManyMock.mockResolvedValue([
        {
          resourceType: "products",
          enabled: true,
          cronExpression: "*/15 * * * *",
          nextRunAt: new Date("2000-01-01T00:00:00Z"), // way in the past
        },
      ]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toEqual(["products"]);

      // A fetch should have been made to the sync endpoint with the products resource.
      const syncCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes("/api/sync?")
      );
      expect(syncCalls).toHaveLength(1);
      const syncUrl = String(syncCalls[0][0]);
      expect(syncUrl).toContain("resourceType=products");
      expect(syncUrl).toMatch(/jobId=cron-products-\d+/);
      expect(syncUrl.startsWith("https://gateway.example.com")).toBe(true);
      // The route fires a POST.
      expect((syncCalls[0][1] as RequestInit)?.method).toBe("POST");

      // cronConfig.update should have been called with lastRunAt/nextRunAt/lastJobId.
      expect(updateMock).toHaveBeenCalledTimes(1);
      const updateArgs = updateMock.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ resourceType: "products" });
      expect(updateArgs.data.lastRunAt).toBeInstanceOf(Date);
      expect(updateArgs.data.nextRunAt).toEqual(FIXED_NEXT_RUN);
      expect(updateArgs.data.lastJobId).toMatch(/^cron-products-\d+$/);
    });

    it("skips a row whose nextRunAt is in the future", async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000); // +1h
      findManyMock.mockResolvedValue([
        {
          resourceType: "customers",
          enabled: true,
          cronExpression: "0 * * * *",
          nextRunAt: future,
        },
      ]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toEqual([]);
      expect(updateMock).not.toHaveBeenCalled();
      const syncCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes("/api/sync?")
      );
      expect(syncCalls).toHaveLength(0);
    });

    it("dispatches multiple due rows and updates each one", async () => {
      findManyMock.mockResolvedValue([
        {
          resourceType: "products",
          enabled: true,
          cronExpression: "*/15 * * * *",
          nextRunAt: null, // first run — considered due
        },
        {
          resourceType: "orders",
          enabled: true,
          cronExpression: "0 * * * *",
          nextRunAt: new Date("2000-01-01T00:00:00Z"),
        },
      ]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toEqual(["products", "orders"]);
      expect(updateMock).toHaveBeenCalledTimes(2);
      const updatedResources = updateMock.mock.calls.map(
        (c) => (c[0] as { where: { resourceType: string } }).where.resourceType
      );
      expect(updatedResources).toEqual(["products", "orders"]);
    });

    it("maps the 'inventory' resource type to a /api/sync?resourceType=products call", async () => {
      findManyMock.mockResolvedValue([
        {
          resourceType: "inventory",
          enabled: true,
          cronExpression: "*/15 * * * *",
          nextRunAt: null,
        },
      ]);

      const res = await GET(makeRequest({ authHeader: "Bearer top-secret" }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.launched).toEqual(["inventory"]);

      const syncCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes("/api/sync?")
      );
      expect(syncCalls).toHaveLength(1);
      const syncUrl = String(syncCalls[0][0]);
      expect(syncUrl).toContain("resourceType=products");
      expect(syncUrl).toMatch(/jobId=cron-inventory-\d+/);
    });
  });
});
