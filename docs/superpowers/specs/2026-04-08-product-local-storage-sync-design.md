# Product Local Storage & Auto-Sync Design

## Goal

Store enriched PrestaShop product data locally in Neon and keep it in sync automatically via a cron job every 15 minutes. The product listing UI reads from the local database instead of calling PrestaShop on every page load.

## New Data: What We Add

Currently the product listing fetches from PrestaShop API on every load and shows: image, name, reference, price, status, sync status.

After this work:
- **Prix HT** — from PrestaShop `price` field (always HT)
- **Stock disponible** — sum of `stock_availables` quantities
- **Description FR/EN** — full HTML description
- **Description courte FR/EN** — short description
- **Tags catégories** — names of all associated categories
- All data stored locally in Neon, updated every 15 min

## Architecture

### 1. Prisma Model: `Product`

```prisma
model Product {
  id                  Int      @id @default(autoincrement())
  psId                Int      @unique
  reference           String?
  ean13               String?
  weight              Decimal?
  active              Boolean
  nameFr              String?
  nameEn              String?
  descriptionFr       String?  @db.Text
  descriptionEn       String?  @db.Text
  descriptionShortFr  String?  @db.Text
  descriptionShortEn  String?  @db.Text
  priceHT             Decimal
  taxRuleGroupId      Int?
  stockAvailable      Int      @default(0)
  categoryDefault     String?
  categoryTags        String[]
  imageDefault        Int?
  imageIds            Int[]
  dataHash            String
  lastSyncedAt        DateTime
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

### 2. Cron Sync Job (Inngest, every 15 min)

Function: `syncProductsToLocal`

Flow:
1. Fetch all categories once (build `id -> name` lookup map)
2. Fetch all products from PrestaShop (paginated, batch of 50)
3. For each product:
   - Fetch `stock_availables` (sum quantities)
   - Resolve category names from associations
   - Compute data hash (covers all fields: price, stock, descriptions, categories)
   - Compare with existing hash in local DB
   - If different: upsert `Product` row
   - If same: skip
4. Delete local `Product` rows whose `psId` no longer exists in PrestaShop
5. Log result in `SyncLog`

Optimizations:
- Categories fetched once at start (lookup map)
- Stock fetched per product via existing `stock_availables` API
- Batch processing (50 products per batch)
- Hash-based change detection (only write when data changed)

Manual trigger: `POST /api/sync/local` button in UI.

### 3. API Routes

**New:**
- `GET /api/products` — paginated listing from local DB with filters (search, status, category, stock, sync)
- `GET /api/products/[id]` — single product detail from local DB
- `POST /api/sync/local` — trigger manual sync job

**Kept:**
- `/api/prestashop/images/*` — image proxy (images still served from PS)
- `/api/prestashop/[resource]` — kept for debug/fallback
- `/api/sync` — existing Shopify sync (unchanged)
- `/api/mapping` — existing mapping endpoint (unchanged)

### 4. UI Changes

**Product table** (`product-table.tsx`):
- Data source: `GET /api/products` (local DB) instead of `/api/prestashop/products`
- Columns: Image | Nom | Ref | Prix HT | Stock | Categories | Statut | Sync
- New filters: stock (en stock / rupture), category dropdown from local data

**Product detail panel** (`product-detail-panel.tsx`):
- Data source: `GET /api/products/[id]` (local DB)
- Shows: descriptions FR/EN, prix HT, stock, category tags
- Images still via `/api/prestashop/images/*`

**New UI elements:**
- "Synchroniser" button triggering `POST /api/sync/local`
- "Derniere synchro il y a X min" indicator

### 5. Tax Handling

PrestaShop stores prices HT. All products use `id_tax_rules_group = 6` ("CA Standard Rate") which is a combined federal + provincial tax system. TTC varies by province.

Decision: display **prix HT only**. Store `taxRuleGroupId` as reference for potential future use.

### 6. What Stays the Same

- Shopify sync mechanism (Inngest jobs, IdMapping, SyncLog) — unchanged
- Image proxy route — unchanged
- PrestaShop connector (API + DB fallback) — reused by the new cron job
- Auth/session management — unchanged
