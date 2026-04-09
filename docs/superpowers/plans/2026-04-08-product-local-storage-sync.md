# Product Local Storage & Auto-Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store enriched PrestaShop product data in Neon DB and auto-sync every 15 min so the UI reads locally instead of hitting PrestaShop on each page load.

**Architecture:** Add a `Product` table to Prisma schema. New Inngest cron function fetches all products from PrestaShop, enriches with stock/categories/descriptions, and upserts into Neon using hash-based change detection. New API routes serve products from local DB. UI components rewired to read from local API.

**Tech Stack:** Prisma (Neon PostgreSQL), Inngest (cron), Next.js App Router API routes, React (shadcn/ui)

---

## File Structure

### New files:
- `src/lib/sync/local-sync.ts` — Core logic: fetch from PS, enrich, hash, upsert into local Product table
- `src/app/api/products/route.ts` — GET paginated product listing from local DB
- `src/app/api/products/[id]/route.ts` — GET single product detail from local DB
- `src/app/api/sync/local/route.ts` — POST trigger manual local sync

### Modified files:
- `prisma/schema.prisma` — Add `Product` model
- `src/lib/inngest/functions.ts` — Add `syncLocalProducts` cron function, export it
- `src/lib/prestashop/types.ts` — Add `PSResourceType` entries for `tax_rule_groups`, `tax_rules`, `taxes`
- `src/components/prestashop/product-table.tsx` — Read from `/api/products`, add stock column
- `src/components/prestashop/product-detail-panel.tsx` — Read from `/api/products/[id]`, show descriptions/categories
- `src/components/prestashop/product-filters.tsx` — Add stock filter
- `src/app/(dashboard)/prestashop/products/page.tsx` — Add sync button + last sync indicator

---

### Task 1: Add Product model to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the Product model**

Add after the `Session` model in `prisma/schema.prisma`:

```prisma
model Product {
  id                 Int      @id @default(autoincrement())
  psId               Int      @unique @map("ps_id")
  reference          String?
  ean13              String?
  weight             Decimal? @db.Decimal(10, 3)
  active             Boolean  @default(true)
  nameFr             String?  @map("name_fr")
  nameEn             String?  @map("name_en")
  descriptionFr      String?  @map("description_fr") @db.Text
  descriptionEn      String?  @map("description_en") @db.Text
  descriptionShortFr String?  @map("description_short_fr") @db.Text
  descriptionShortEn String?  @map("description_short_en") @db.Text
  priceHT            Decimal  @map("price_ht") @db.Decimal(10, 6)
  taxRuleGroupId     Int?     @map("tax_rule_group_id")
  stockAvailable     Int      @default(0) @map("stock_available")
  categoryDefault    String?  @map("category_default")
  categoryTags       String[] @map("category_tags")
  imageDefault       Int?     @map("image_default")
  imageIds           Int[]    @map("image_ids")
  dataHash           String   @map("data_hash")
  lastSyncedAt       DateTime @default(now()) @map("last_synced_at") @db.Timestamptz()
  createdAt          DateTime @default(now()) @map("created_at") @db.Timestamptz()
  updatedAt          DateTime @updatedAt @map("updated_at") @db.Timestamptz()

  @@map("products")
}
```

- [ ] **Step 2: Generate and apply migration**

Run:
```bash
npx prisma migrate dev --name add-product-table
```

Expected: Migration created and applied, `products` table exists in Neon.

- [ ] **Step 3: Verify Prisma client generation**

Run:
```bash
npx prisma generate
```

Expected: Prisma client regenerated with `Product` model.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add Product model for local storage of PrestaShop products"
```

---

### Task 2: Build local sync logic

**Files:**
- Create: `src/lib/sync/local-sync.ts`
- Modify: `src/lib/prestashop/types.ts`

- [ ] **Step 1: Add missing resource types to PSResourceType**

In `src/lib/prestashop/types.ts`, change the `PSResourceType` union at line 111:

```typescript
export type PSResourceType = "products" | "categories" | "customers" | "addresses" | "orders" | "stock_availables" | "combinations" | "images" | "tax_rule_groups" | "tax_rules" | "taxes";
```

- [ ] **Step 2: Create local-sync.ts**

Create `src/lib/sync/local-sync.ts`:

```typescript
import type { PSProduct, PSCategory, PSStockAvailable } from "@/lib/prestashop/types";
import type { PSConnector } from "@/lib/prestashop/connector";
import type { PrismaClient } from "@prisma/client";
import { contentHash } from "./hash";

interface CategoryLookup {
  [id: string]: { nameFr: string; nameEn: string };
}

function getLangValue(values: { id: string; value: string }[], langId: string): string {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

async function buildCategoryLookup(ps: PSConnector): Promise<CategoryLookup> {
  const categories = await ps.list<PSCategory>("categories", { display: "full" });
  const lookup: CategoryLookup = {};
  for (const cat of categories) {
    lookup[String(cat.id)] = {
      nameFr: getLangValue(cat.name, "1"),
      nameEn: getLangValue(cat.name, "2"),
    };
  }
  return lookup;
}

async function getProductStock(ps: PSConnector, productId: number, stockAvailableIds: { id: string; id_product_attribute: string }[]): Promise<number> {
  let total = 0;
  for (const sa of stockAvailableIds) {
    try {
      const stock = await ps.get<PSStockAvailable>("stock_availables", parseInt(sa.id));
      total += parseInt(stock.quantity || "0");
    } catch {
      // skip unavailable stock entries
    }
  }
  return total;
}

interface LocalSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  errors: number;
}

export async function syncProductsToLocal(
  ps: PSConnector,
  prisma: PrismaClient,
  jobId: string
): Promise<LocalSyncResult> {
  const result: LocalSyncResult = { total: 0, created: 0, updated: 0, skipped: 0, deleted: 0, errors: 0 };

  // Build category lookup once
  const categoryLookup = await buildCategoryLookup(ps);

  // Fetch all products in batches
  const batchSize = 50;
  let offset = 0;
  const seenPsIds: number[] = [];
  let hasMore = true;

  while (hasMore) {
    const products = await ps.list<PSProduct>("products", {
      limit: batchSize,
      offset,
      display: "full",
    });

    if (products.length === 0) {
      hasMore = false;
      break;
    }

    for (const product of products) {
      result.total++;
      seenPsIds.push(product.id);

      try {
        // Get stock
        const stockAvailables = product.associations?.stock_availables ?? [];
        const stockAvailable = await getProductStock(ps, product.id, stockAvailables);

        // Resolve categories
        const catIds = product.associations?.categories ?? [];
        const categoryTags: string[] = [];
        for (const catRef of catIds) {
          const cat = categoryLookup[catRef.id];
          if (cat) {
            const name = cat.nameEn || cat.nameFr;
            if (name && name !== "Root" && name !== "Racine" && name !== "Home" && name !== "Accueil") {
              categoryTags.push(name);
            }
          }
        }

        const defaultCat = categoryLookup[product.id_category_default];
        const categoryDefault = defaultCat?.nameEn || defaultCat?.nameFr || null;

        // Build product data for hashing and storage
        const imageIds = (product.associations?.images ?? []).map((img) => parseInt(img.id));
        const imageDefault = product.id_default_image && product.id_default_image !== "0"
          ? parseInt(product.id_default_image)
          : null;

        const productData = {
          reference: product.reference || null,
          ean13: product.ean13 || null,
          weight: product.weight ? parseFloat(product.weight) : null,
          active: product.active === "1",
          nameFr: getLangValue(product.name, "1") || null,
          nameEn: getLangValue(product.name, "2") || null,
          descriptionFr: getLangValue(product.description, "1") || null,
          descriptionEn: getLangValue(product.description, "2") || null,
          descriptionShortFr: getLangValue(product.description_short, "1") || null,
          descriptionShortEn: getLangValue(product.description_short, "2") || null,
          priceHT: parseFloat(product.price),
          taxRuleGroupId: product.id_tax_rules_group ? parseInt(String(product.id_tax_rules_group)) : null,
          stockAvailable,
          categoryDefault,
          categoryTags,
          imageDefault,
          imageIds,
        };

        const hash = contentHash(productData);

        // Check existing
        const existing = await (prisma as any).product.findUnique({
          where: { psId: product.id },
          select: { dataHash: true },
        });

        if (existing?.dataHash === hash) {
          result.skipped++;
          continue;
        }

        await (prisma as any).product.upsert({
          where: { psId: product.id },
          create: {
            psId: product.id,
            ...productData,
            dataHash: hash,
            lastSyncedAt: new Date(),
          },
          update: {
            ...productData,
            dataHash: hash,
            lastSyncedAt: new Date(),
          },
        });

        if (existing) {
          result.updated++;
        } else {
          result.created++;
        }
      } catch (err) {
        result.errors++;
        const message = err instanceof Error ? err.message : "Unknown error";
        await (prisma as any).syncLog.create({
          data: { jobId, resourceType: "local_product", psId: product.id, action: "error", details: { error: message } },
        });
      }
    }

    offset += batchSize;
    if (products.length < batchSize) {
      hasMore = false;
    }
  }

  // Delete local products no longer in PrestaShop
  if (seenPsIds.length > 0) {
    const deleteResult = await (prisma as any).product.deleteMany({
      where: { psId: { notIn: seenPsIds } },
    });
    result.deleted = deleteResult.count;
  }

  // Log summary
  await (prisma as any).syncLog.create({
    data: {
      jobId,
      resourceType: "local_product",
      action: "sync_complete",
      details: result,
    },
  });

  return result;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/local-sync.ts src/lib/prestashop/types.ts
git commit -m "feat: add local sync logic for PrestaShop products to Neon"
```

---

### Task 3: Add Inngest cron function

**Files:**
- Modify: `src/lib/inngest/functions.ts`

- [ ] **Step 1: Add the syncLocalProducts cron function**

Add the following import at the top of `src/lib/inngest/functions.ts` (after existing imports):

```typescript
import { syncProductsToLocal } from "@/lib/sync/local-sync";
```

Add the function before the `inngestFunctions` export (before line 126):

```typescript
export const syncLocalProducts = inngest.createFunction(
  {
    id: "sync-local-products",
    retries: 1,
  },
  { cron: "*/15 * * * *" },
  async ({ step }) => {
    const result = await step.run("sync-products-to-local", async () => {
      const psConnector = getPSConnector();
      const jobId = `local-sync-${Date.now()}`;
      return syncProductsToLocal(psConnector, prisma, jobId);
    });

    return result;
  }
);
```

Update the `inngestFunctions` export at line 126:

```typescript
export const inngestFunctions = [syncProducts, syncCustomers, syncSingle, syncLocalProducts];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/inngest/functions.ts
git commit -m "feat: add Inngest cron job for local product sync every 15 min"
```

---

### Task 4: Create local products API routes

**Files:**
- Create: `src/app/api/products/route.ts`
- Create: `src/app/api/products/[id]/route.ts`
- Create: `src/app/api/sync/local/route.ts`

- [ ] **Step 1: Create GET /api/products**

Create `src/app/api/products/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") ?? "25");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const stock = searchParams.get("stock") ?? "all";
  const sync = searchParams.get("sync") ?? "all";

  try {
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { nameEn: { contains: search, mode: "insensitive" } },
        { nameFr: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") where.active = true;
    if (status === "inactive") where.active = false;

    if (category !== "all") where.categoryTags = { has: category };

    if (stock === "in_stock") where.stockAvailable = { gt: 0 };
    if (stock === "out_of_stock") where.stockAvailable = { equals: 0 };

    // Sync filter requires join with IdMapping
    let syncFilter: Record<string, unknown> | undefined;
    if (sync !== "all") {
      syncFilter = { resourceType: "product" };
      if (sync === "error") syncFilter.syncStatus = "error";
    }

    const [products, total] = await Promise.all([
      (prisma as any).product.findMany({
        where,
        orderBy: { psId: "asc" },
        skip: offset,
        take: limit,
      }),
      (prisma as any).product.count({ where }),
    ]);

    // Get sync mappings for these products
    const psIds = products.map((p: { psId: number }) => p.psId);
    const mappings = await (prisma as any).idMapping.findMany({
      where: { resourceType: "product", psId: { in: psIds } },
    });
    const syncMap = new Map(
      mappings.map((m: { psId: number; shopifyGid: string; syncStatus: string; lastSyncedAt: Date }) => [
        m.psId,
        { shopifyGid: m.shopifyGid, syncStatus: m.syncStatus, lastSyncedAt: m.lastSyncedAt },
      ])
    );

    const enriched = products.map((p: Record<string, unknown>) => ({
      ...p,
      priceHT: Number(p.priceHT),
      weight: p.weight ? Number(p.weight) : null,
      sync: syncMap.get(p.psId as number) ?? null,
    }));

    // Filter by sync status client-side (cross-table filter)
    let filtered = enriched;
    if (sync === "synced") filtered = enriched.filter((p: Record<string, unknown>) => p.sync !== null);
    if (sync === "not_synced") filtered = enriched.filter((p: Record<string, unknown>) => p.sync === null);
    if (sync === "error") filtered = enriched.filter((p: Record<string, unknown>) => (p.sync as Record<string, unknown> | null)?.syncStatus === "error");

    // Get last sync time
    const lastSync = await (prisma as any).syncLog.findFirst({
      where: { resourceType: "local_product", action: "sync_complete" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    return NextResponse.json({
      data: filtered,
      total,
      limit,
      offset,
      lastSyncedAt: lastSync?.createdAt ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create GET /api/products/[id]**

Create `src/app/api/products/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const psId = parseInt(id);

  if (isNaN(psId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  try {
    const product = await (prisma as any).product.findUnique({
      where: { psId },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Get sync info
    const mapping = await (prisma as any).idMapping.findUnique({
      where: { resourceType_psId: { resourceType: "product", psId } },
    });

    return NextResponse.json({
      ...product,
      priceHT: Number(product.priceHT),
      weight: product.weight ? Number(product.weight) : null,
      sync: mapping
        ? { shopifyGid: mapping.shopifyGid, syncStatus: mapping.syncStatus, lastSyncedAt: mapping.lastSyncedAt }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create POST /api/sync/local**

Create `src/app/api/sync/local/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

export async function POST() {
  try {
    await inngest.send({ name: "sync/local-products" });
    return NextResponse.json({ status: "triggered" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

Wait — the cron function uses `cron` trigger, not event trigger. To also allow manual triggering, we need to update the Inngest function to accept both triggers.

Update the sync function in `src/lib/inngest/functions.ts` to use both cron and event triggers:

```typescript
export const syncLocalProducts = inngest.createFunction(
  {
    id: "sync-local-products",
    retries: 1,
  },
  [{ cron: "*/15 * * * *" }, { event: "sync/local-products" }],
  async ({ step }) => {
    const result = await step.run("sync-products-to-local", async () => {
      const psConnector = getPSConnector();
      const jobId = `local-sync-${Date.now()}`;
      return syncProductsToLocal(psConnector, prisma, jobId);
    });

    return result;
  }
);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/products/ src/app/api/sync/local/ src/lib/inngest/functions.ts
git commit -m "feat: add local products API routes and manual sync trigger"
```

---

### Task 5: Update product table to use local data

**Files:**
- Modify: `src/components/prestashop/product-table.tsx`

- [ ] **Step 1: Rewrite ProductTable to use local API**

Replace the entire content of `src/components/prestashop/product-table.tsx`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFilters, type FilterState } from "./product-filters";

interface LocalProduct {
  id: number;
  psId: number;
  reference: string | null;
  active: boolean;
  nameFr: string | null;
  nameEn: string | null;
  priceHT: number;
  stockAvailable: number;
  categoryDefault: string | null;
  categoryTags: string[];
  imageDefault: number | null;
  sync: {
    shopifyGid: string;
    syncStatus: string;
    lastSyncedAt: string;
  } | null;
}

interface ProductTableProps {
  onSelectProduct: (product: { id: number; psId: number }) => void;
  lastSyncedAt: string | null;
  onLastSyncUpdate: (date: string | null) => void;
}

export function ProductTable({ onSelectProduct, lastSyncedAt, onLastSyncUpdate }: ProductTableProps) {
  const [products, setProducts] = useState<LocalProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: "all",
    lang: "2",
    sync: "all",
    category: "all",
    image: "all",
    stock: "all",
  });
  const limit = 25;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (filters.search) params.set("search", filters.search);
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.stock !== "all") params.set("stock", filters.stock);
    if (filters.sync !== "all") params.set("sync", filters.sync);

    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    setProducts(json.data ?? []);
    setTotal(json.total ?? 0);
    if (json.lastSyncedAt) onLastSyncUpdate(json.lastSyncedAt);
    setLoading(false);
  }, [offset, filters.search, filters.status, filters.category, filters.stock, filters.sync, onLastSyncUpdate]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function getName(product: LocalProduct) {
    return (filters.lang === "2" ? product.nameEn : product.nameFr) || product.nameFr || product.nameEn || "—";
  }

  function getImageUrl(product: LocalProduct): string | null {
    if (!product.imageDefault) return null;
    return `/api/prestashop/images/${product.psId}/${product.imageDefault}`;
  }

  function toggleSelect(psId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(psId)) next.delete(psId);
      else next.add(psId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map((p) => p.psId)));
    }
  }

  return (
    <div>
      <ProductFilters
        filters={filters}
        onChange={setFilters}
        onApply={fetchProducts}
        categories={[]}
      />

      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{selected.size} sélectionné(s)</span>
          <Button
            size="sm"
            onClick={() => {
              const ids = Array.from(selected);
              fetch("/api/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resourceType: "products", shop: "maison-du-savon-ca.myshopify.com", psIds: ids }),
              });
            }}
          >
            Sync selected to Shopify
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  checked={products.length > 0 && selected.size === products.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="p-3 text-left w-12">Image</th>
              <th className="p-3 text-left">Nom</th>
              <th className="p-3 text-left">Réf</th>
              <th className="p-3 text-left">Prix HT</th>
              <th className="p-3 text-left">Stock</th>
              <th className="p-3 text-left">Catégories</th>
              <th className="p-3 text-left">Statut</th>
              <th className="p-3 text-left">Sync</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  <td className="p-3" colSpan={9}>
                    <Skeleton className="h-8 w-full" />
                  </td>
                </tr>
              ))
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-3 text-center text-muted-foreground">
                  Aucun produit trouvé
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const imgUrl = getImageUrl(p);
                return (
                  <tr
                    key={p.psId}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => onSelectProduct({ id: p.id, psId: p.psId })}
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(p.psId)}
                        onChange={() => toggleSelect(p.psId)}
                      />
                    </td>
                    <td className="p-3">
                      {imgUrl ? (
                        <img src={imgUrl} alt="" className="w-9 h-9 rounded object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          —
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-medium">{getName(p)}</td>
                    <td className="p-3 font-mono text-xs">{p.reference || "—"}</td>
                    <td className="p-3">{p.priceHT.toFixed(2)} $</td>
                    <td className="p-3">
                      <Badge variant={p.stockAvailable > 0 ? "default" : "destructive"}>
                        {p.stockAvailable}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs max-w-[150px] truncate">
                      {p.categoryTags.length > 0 ? p.categoryTags.join(", ") : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={p.active ? "default" : "secondary"}>
                        {p.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {p.sync ? (
                        <Badge variant={p.sync.syncStatus === "error" ? "destructive" : "default"}>
                          {p.sync.syncStatus === "synced" ? "✓ Synced" : p.sync.syncStatus === "error" ? "Erreur" : p.sync.syncStatus}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">
          {offset + 1}–{offset + products.length} sur {total} produits
        </span>
        <Button variant="outline" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>
          Suivant
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prestashop/product-table.tsx
git commit -m "feat: rewire product table to read from local database"
```

---

### Task 6: Update product detail panel to use local data

**Files:**
- Modify: `src/components/prestashop/product-detail-panel.tsx`

- [ ] **Step 1: Rewrite ProductDetailPanel to use local API**

Replace the entire content of `src/components/prestashop/product-detail-panel.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface LocalProductDetail {
  id: number;
  psId: number;
  reference: string | null;
  ean13: string | null;
  weight: number | null;
  active: boolean;
  nameFr: string | null;
  nameEn: string | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
  descriptionShortFr: string | null;
  descriptionShortEn: string | null;
  priceHT: number;
  stockAvailable: number;
  categoryDefault: string | null;
  categoryTags: string[];
  imageDefault: number | null;
  imageIds: number[];
  lastSyncedAt: string;
  sync: {
    shopifyGid: string;
    syncStatus: string;
    lastSyncedAt: string;
  } | null;
}

interface ProductDetailPanelProps {
  psId: number;
  onClose: () => void;
}

export function ProductDetailPanel({ psId, onClose }: ProductDetailPanelProps) {
  const [product, setProduct] = useState<LocalProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    setLoading(true);
    setCurrentImageIndex(0);

    fetch(`/api/products/${psId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setProduct(null);
        } else {
          setProduct(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [psId]);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resourceType: "products",
        shop: "maison-du-savon-ca.myshopify.com",
        psIds: [psId],
      }),
    });
    setSyncing(false);
  }

  const imageIds = product?.imageIds ?? [];
  const currentImageId = imageIds[currentImageIndex];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-black/50 absolute inset-0" />
      <div
        className="relative w-[420px] bg-background border-l shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b p-3 flex justify-between items-center z-10">
          <span className="text-sm font-semibold">Produit #{psId}</span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : product ? (
          <div className="p-4 space-y-6">
            {imageIds.length > 0 ? (
              <div>
                <img
                  src={`/api/prestashop/images/${product.psId}/${currentImageId}`}
                  alt=""
                  className="w-full h-56 object-contain rounded-md bg-muted"
                />
                {imageIds.length > 1 && (
                  <div className="flex gap-2 mt-2 justify-center">
                    {imageIds.map((imgId, i) => (
                      <button
                        key={imgId}
                        onClick={() => setCurrentImageIndex(i)}
                        className={`w-12 h-12 rounded border overflow-hidden ${i === currentImageIndex ? "ring-2 ring-primary" : ""}`}
                      >
                        <img
                          src={`/api/prestashop/images/${product.psId}/${imgId}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-40 bg-muted rounded-md flex items-center justify-center text-muted-foreground">
                Pas d&apos;image
              </div>
            )}

            <div>
              <h3 className="font-semibold text-lg">{product.nameEn || product.nameFr || "—"}</h3>
              <p className="text-sm text-muted-foreground">{product.nameFr || ""}</p>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description (EN)</span>
                <div
                  className="text-sm"
                  dangerouslySetInnerHTML={{
                    __html: product.descriptionShortEn || product.descriptionEn || "<em>—</em>",
                  }}
                />
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground">Description (FR)</span>
                <div
                  className="text-sm"
                  dangerouslySetInnerHTML={{
                    __html: product.descriptionShortFr || product.descriptionFr || "<em>—</em>",
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Prix HT</span>
                <p className="font-medium">{product.priceHT.toFixed(2)} $</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Référence</span>
                <p className="font-mono text-xs">{product.reference || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">EAN13</span>
                <p className="font-mono text-xs">{product.ean13 || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Poids</span>
                <p>{product.weight ? `${product.weight.toFixed(2)} kg` : "—"}</p>
              </div>
            </div>

            <div>
              <span className="text-xs text-muted-foreground">Stock disponible</span>
              <p className="text-lg font-bold">{product.stockAvailable}</p>
            </div>

            {product.categoryTags.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Catégories</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {product.categoryTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Badge variant={product.active ? "default" : "secondary"}>
                {product.active ? "Active" : "Inactive"}
              </Badge>
              {product.sync ? (
                <Badge variant={product.sync.syncStatus === "error" ? "destructive" : "default"}>
                  {product.sync.syncStatus === "synced" ? "✓ Synced" : product.sync.syncStatus}
                </Badge>
              ) : (
                <Badge variant="secondary">Non synced</Badge>
              )}
            </div>

            {product.sync?.shopifyGid && (
              <div className="text-xs text-muted-foreground">
                <p>Shopify: {product.sync.shopifyGid}</p>
                <p>Dernière sync: {new Date(product.sync.lastSyncedAt).toLocaleString()}</p>
              </div>
            )}

            <Button onClick={handleSync} disabled={syncing} className="w-full">
              {syncing ? "Sync en cours..." : product.sync ? "Re-sync ce produit" : "Sync ce produit"}
            </Button>
          </div>
        ) : (
          <div className="p-4 text-muted-foreground">Produit introuvable</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prestashop/product-detail-panel.tsx
git commit -m "feat: rewire product detail panel to read from local database"
```

---

### Task 7: Update filters with stock filter

**Files:**
- Modify: `src/components/prestashop/product-filters.tsx`

- [ ] **Step 1: Add stock filter to FilterState and UI**

Replace the entire content of `src/components/prestashop/product-filters.tsx`:

```typescript
"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FilterState {
  search: string;
  status: "all" | "active" | "inactive";
  lang: "1" | "2";
  sync: "all" | "synced" | "not_synced" | "error";
  category: string;
  image: "all" | "with" | "without";
  stock: "all" | "in_stock" | "out_of_stock";
}

interface ProductFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onApply: () => void;
  categories: { id: number; name: string }[];
}

export type { FilterState };

export function ProductFilters({ filters, onChange, onApply, categories }: ProductFiltersProps) {
  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4 items-end">
      <div>
        <label className="text-xs text-muted-foreground">Statut</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.status}
          onChange={(e) => set("status", e.target.value as FilterState["status"])}
        >
          <option value="all">Tous</option>
          <option value="active">Actif</option>
          <option value="inactive">Inactif</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Langue</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.lang}
          onChange={(e) => set("lang", e.target.value as FilterState["lang"])}
        >
          <option value="2">English</option>
          <option value="1">Français</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Stock</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.stock}
          onChange={(e) => set("stock", e.target.value as FilterState["stock"])}
        >
          <option value="all">Tous</option>
          <option value="in_stock">En stock</option>
          <option value="out_of_stock">Rupture</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Sync</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.sync}
          onChange={(e) => set("sync", e.target.value as FilterState["sync"])}
        >
          <option value="all">Tous</option>
          <option value="synced">Synced</option>
          <option value="not_synced">Non synced</option>
          <option value="error">Erreur</option>
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Catégorie</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.category}
          onChange={(e) => set("category", e.target.value)}
        >
          <option value="all">Toutes</option>
          {categories.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Image</label>
        <select
          className="block w-full rounded-md border bg-background px-3 py-1.5 text-sm"
          value={filters.image}
          onChange={(e) => set("image", e.target.value as FilterState["image"])}
        >
          <option value="all">Tous</option>
          <option value="with">Avec image</option>
          <option value="without">Sans image</option>
        </select>
      </div>

      <div className="flex-1 min-w-[200px]">
        <label className="text-xs text-muted-foreground">Recherche</label>
        <div className="flex gap-2">
          <Input
            placeholder="Rechercher un produit..."
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onApply()}
          />
          <Button onClick={onApply}>Filtrer</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/prestashop/product-filters.tsx
git commit -m "feat: add stock filter to product filters"
```

---

### Task 8: Update products page with sync button and last sync indicator

**Files:**
- Modify: `src/app/(dashboard)/prestashop/products/page.tsx`

- [ ] **Step 1: Add sync button and last sync indicator**

Replace the entire content of `src/app/(dashboard)/prestashop/products/page.tsx`:

```typescript
"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ProductTable } from "@/components/prestashop/product-table";
import { ProductDetailPanel } from "@/components/prestashop/product-detail-panel";

interface SelectedProduct {
  id: number;
  psId: number;
}

export default function ProductsPage() {
  const [selectedProduct, setSelectedProduct] = useState<SelectedProduct | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleLastSyncUpdate = useCallback((date: string | null) => {
    setLastSyncedAt(date);
  }, []);

  async function triggerSync() {
    setSyncing(true);
    try {
      await fetch("/api/sync/local", { method: "POST" });
    } catch {
      // ignore
    }
    setSyncing(false);
  }

  function formatSyncTime(dateStr: string | null): string {
    if (!dateStr) return "Jamais";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "À l'instant";
    if (minutes < 60) return `Il y a ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `Il y a ${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ""}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">PrestaShop Products</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Dernière synchro: {formatSyncTime(lastSyncedAt)}
          </span>
          <Button size="sm" variant="outline" onClick={triggerSync} disabled={syncing}>
            {syncing ? "Sync en cours..." : "Synchroniser"}
          </Button>
        </div>
      </div>

      <ProductTable
        onSelectProduct={(p) => setSelectedProduct({ id: p.id, psId: p.psId })}
        lastSyncedAt={lastSyncedAt}
        onLastSyncUpdate={handleLastSyncUpdate}
      />

      {selectedProduct && (
        <ProductDetailPanel
          psId={selectedProduct.psId}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\(dashboard\)/prestashop/products/page.tsx
git commit -m "feat: add sync button and last sync indicator to products page"
```

---

### Task 9: Push env vars to Vercel and verify

**Files:** none (infrastructure)

- [ ] **Step 1: Push environment variables to Vercel**

Run the following to add the PrestaShop credentials to Vercel for all environments:

```bash
echo "CGQL9L2YT5I5PMIV9QKA297HLLENSY7Z" | vercel env add PRESTASHOP_API_KEY production preview development --sensitive
echo "https://maison-savon-marseille.ca/api/" | vercel env add PRESTASHOP_API_URL production preview development
```

- [ ] **Step 2: Verify the local dev server starts**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/prestashop/products` — the page should load (empty table until first sync runs).

- [ ] **Step 3: Trigger an initial sync manually**

Run via the UI "Synchroniser" button, or:
```bash
curl -X POST http://localhost:3000/api/sync/local
```

Expected: Products populate in the table after sync completes.

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "chore: finalize local product sync setup"
```
