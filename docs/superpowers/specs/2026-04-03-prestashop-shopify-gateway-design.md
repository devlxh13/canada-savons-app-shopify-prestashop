# PrestaShop → Shopify Gateway — Design Spec

**Date:** 2026-04-03
**Project:** CANADA - Shopify Savons
**Repo:** devlxh13/canada-savons-app-shopify-prestashop
**Linear:** https://linear.app/lxhbrand/project/canada-shopify-savons-ead9ecc5fba8

## Overview

A gateway application that reads data from a PrestaShop store (maison-savon-marseille.ca) and writes it into a Shopify store (maison-du-savon-ca.myshopify.com). The system provides both an API (usable by Claude or programmatically) and a web dashboard for manual operations and visibility.

**Goal:** Migrate products, customers, and order history from PrestaShop to Shopify, with an extensible architecture that supports any PrestaShop resource type and future continuous sync.

## Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js (TypeScript) |
| Hosting | Vercel (dev@lxhbrand.com, team: lxhs-projects-bcfa0947) |
| Database | Neon PostgreSQL (mapping, logs, sessions) |
| Job Queue | Inngest (background sync jobs, retry, scheduling) |
| UI | Tailwind CSS + shadcn/ui |
| ORM | Prisma |
| Shopify | @shopify/shopify-api (Partner App, OAuth, GraphQL Admin API) |
| PrestaShop | REST Webservice API + direct MySQL (read-only fallback) |
| Tracking | Linear — CANADA - Shopify Savons |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App (Vercel)                      │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Dashboard   │  │  API Routes  │  │  Inngest Functions│  │
│  │  (React)     │  │  /api/*      │  │  (background jobs)│  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘  │
│         │                 │                    │             │
│  ┌──────┴─────────────────┴────────────────────┴──────────┐  │
│  │                   Core Layer                           │  │
│  │                                                        │  │
│  │  ┌────────────────┐  ┌─────────────────┐              │  │
│  │  │  PS Connector   │  │ Shopify Connector│              │  │
│  │  │                │  │                 │              │  │
│  │  │ - PS API Client│  │ - OAuth Flow    │              │  │
│  │  │ - PS DB Client │  │ - Admin API     │              │  │
│  │  │ - Adapters     │  │ - Adapters      │              │  │
│  │  └────────┬───────┘  └────────┬────────┘              │  │
│  │           │                   │                        │  │
│  │  ┌────────┴───────────────────┴────────┐              │  │
│  │  │         Sync Engine                  │              │  │
│  │  │  - Transform PS → Shopify            │              │  │
│  │  │  - ID Mapping                        │              │  │
│  │  │  - Diff / Conflict resolution        │              │  │
│  │  └─────────────────────────────────────┘              │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
        ┌──────┴──────┐                ┌──────┴──────┐
        │   Neon DB    │                │   Inngest   │
        │              │                │             │
        │ - id_mapping │                │ - job queue │
        │ - sync_logs  │                │ - scheduling│
        │ - sessions   │                │ - retry     │
        └──────────────┘                └─────────────┘
```

## PrestaShop Connector

### Dual-Source Strategy

The connector uses two data sources behind a unified interface:

1. **PrestaShop Webservice API** (primary) — REST API at `https://maison-savon-marseille.ca/api/`. Read-only access via API key. Covers standard resources (products, customers, orders, categories, etc.).
2. **Direct MySQL** (fallback) — Read-only queries on the PrestaShop database hosted on OVH. Used when the API doesn't expose a resource or returns incomplete data (custom attributes, specific config tables, etc.).

### Interface

```typescript
interface PSResourceConnector<T> {
  list(filters?: PSFilters): Promise<T[]>
  get(id: number): Promise<T>
  search(query: string): Promise<T[]>
}
```

Both `PSApiClient` and `PSDbClient` implement this interface per resource type. The connector tries the API first and falls back to the DB when needed. Consumers don't know which source is used.

### Resources

| Resource | PS API Endpoint | DB Tables | Shopify Target |
|----------|----------------|-----------|----------------|
| Products | `/api/products` | `ps_product`, `ps_product_lang` | Product |
| Combinations | `/api/combinations` | `ps_product_attribute` | ProductVariant |
| Images | `/api/images` | `ps_image` | ProductImage |
| Categories | `/api/categories` | `ps_category_lang` | Collection |
| Customers | `/api/customers` | `ps_customer` | Customer |
| Addresses | `/api/addresses` | `ps_address` | CustomerAddress |
| Orders | `/api/orders` | `ps_orders` | Order (read-only) |
| Stocks | `/api/stock_availables` | `ps_stock_available` | InventoryLevel |

### Available PS API Resources (confirmed)

The API key has read access to: addresses, carriers, cart_rules, carts, categories, combinations, configurations, contacts, content_management_system, countries, currencies, customer_messages, customer_threads, customers, customizations, deliveries, employees, groups, guests, image_types, images, languages, manufacturers, messages, order_carriers, order_details, order_histories, order_invoices, order_payments, order_slip, order_states, orders, price_ranges, product_customization_fields, product_feature_values, product_features, product_option_values, product_options, products, and more.

### Extensibility

To add a new resource type:
1. Define the TypeScript type
2. Create a connector implementing `PSResourceConnector<T>`
3. Register it in the connector registry
4. The dashboard and API discover it automatically

## Shopify Connector

### Authentication — Partner App with OAuth

The app is a Shopify Partner App. Authentication uses the standard OAuth flow:

```
User → /auth/shopify → Shopify OAuth → /auth/callback → Access Token → Neon DB
```

- Uses `@shopify/shopify-api` for the OAuth flow
- Access tokens stored in Neon (table `sessions`) via `@shopify/shopify-app-session-storage-prisma`
- Target store: `maison-du-savon-ca.myshopify.com`

**Scopes:** `write_products, read_products, write_customers, read_customers, write_orders, read_orders, write_inventory, read_inventory, write_files, read_files`

### GraphQL Admin API

Shopify GraphQL is used over REST for:
- Fewer API calls (fetch product + variants + images in one query)
- Better rate limiting (cost-based rather than per-request)
- Bulk mutations for large imports (`bulkOperationRunMutation`)

### Interface

```typescript
interface ShopifyResourceConnector<TRead, TWrite> {
  list(filters?: ShopifyFilters): Promise<TRead[]>
  get(id: string): Promise<TRead>
  create(data: TWrite): Promise<TRead>
  update(id: string, data: Partial<TWrite>): Promise<TRead>
  delete(id: string): Promise<void>
}
```

### Resources

| Resource | GraphQL Mutations | Bulk Support |
|----------|------------------|-------------|
| Products + Variants | `productCreate`, `productUpdate`, `productSet` | Yes (productSet upsert) |
| Images/Media | `productCreateMedia` | Yes (stagedUploadsCreate) |
| Collections | `collectionCreate` | No (low volume) |
| Customers | `customerCreate` | No (one by one) |
| Orders | Read-only via `orders` query | N/A |
| Inventory | `inventorySetQuantities` | Yes |

**Note on orders:** Shopify doesn't allow standard order creation via Admin API. Historical orders will be imported as Draft Orders or stored in Neon for dashboard consultation.

## Sync Engine

### Pipeline

```
1. Extract       →  2. Transform    →  3. Compare     →  4. Load
(read from PS)      (PS → Shopify      (diff against     (write to Shopify
                     format)            existing via      + save mapping)
                                        mapping + hash)
```

1. **Extract** — PS connector fetches data (API or DB)
2. **Transform** — Adapter converts PS format to Shopify format (prices, HTML descriptions, variants, images, etc.)
3. **Compare** — Check Neon mapping table. If PS ID exists → update. If not → create. If data hash unchanged → skip.
4. **Load** — Shopify connector creates/updates the resource. ID mapping saved to Neon.

### Inngest Jobs

| Job | Trigger | Description |
|-----|---------|-------------|
| `sync.products` | Manual (dashboard/API) | Sync all products or a filtered selection |
| `sync.customers` | Manual | Sync all customers |
| `sync.orders` | Manual | Import order history |
| `sync.single` | Manual (dashboard) | Sync a single resource |
| `sync.scheduled` | Cron (future) | Periodic continuous sync |

Each job is split into **Inngest steps**: one step per batch of resources (e.g., 50 products per step). This enables granular retry and avoids Vercel timeouts.

**Error handling:** If a single product fails, the job continues with the remaining items. The error is logged in `sync_logs` with details. The dashboard surfaces errors for manual action.

## Database Schema (Neon)

### id_mapping

```sql
CREATE TABLE id_mapping (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,        -- "product", "customer", "order", etc.
  ps_id         INTEGER NOT NULL,
  shopify_gid   TEXT NOT NULL,        -- "gid://shopify/Product/123"
  data_hash     TEXT,                 -- content hash for change detection
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sync_status   TEXT NOT NULL DEFAULT 'pending', -- "synced", "error", "pending"
  UNIQUE(resource_type, ps_id)
);
```

### sync_logs

```sql
CREATE TABLE sync_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        TEXT NOT NULL,        -- Inngest event ID
  resource_type TEXT NOT NULL,
  ps_id         INTEGER,
  action        TEXT NOT NULL,        -- "create", "update", "skip", "error"
  details       JSONB,               -- error message, diff, metadata
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### sessions

Managed by `@shopify/shopify-app-session-storage-prisma`. Stores Shopify OAuth session data including access tokens per shop.

## Dashboard

### Pages

| Route | Description |
|-------|-------------|
| `/` | Overview: sync stats, recent jobs, recent errors |
| `/prestashop/products` | Browse PS products (search, filter by category), content preview |
| `/prestashop/customers` | Browse PS customers |
| `/prestashop/orders` | Browse PS orders |
| `/prestashop/[resource]` | Extensible — any new PS resource appears here |
| `/sync` | Launch a sync (choose resource, filters, preview before import) |
| `/sync/[jobId]` | Real-time job tracking (progress, successes, errors) |
| `/mapping` | PS↔Shopify mapping table, statuses, last sync timestamps |
| `/logs` | Full sync history with filters |
| `/settings` | Shopify connection (OAuth), PS config (API key, DB), preferences |

### Typical Workflow

1. User navigates to `/prestashop/products`
2. Browses/filters PS products
3. Selects items to import → clicks "Sync to Shopify"
4. Preview of transformations (what will be created/updated)
5. Confirmation → Inngest job launched
6. Redirect to `/sync/[jobId]` for real-time tracking
7. Result: successes/errors visible, direct links to Shopify admin

### API Routes (used by both Dashboard and Claude)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/prestashop/[resource]` | List PS resources (with filters, pagination) |
| GET | `/api/prestashop/[resource]/[id]` | Get single PS resource |
| POST | `/api/sync` | Launch a sync job |
| GET | `/api/sync/[jobId]` | Get job status |
| GET | `/api/mapping` | List mappings (with filters) |
| GET | `/api/logs` | List sync logs (with filters) |

## Security

### Credentials

All secrets stored as **Vercel environment variables**, never in code:

| Variable | Usage |
|----------|-------|
| `SHOPIFY_API_KEY` | Partner App client ID |
| `SHOPIFY_API_SECRET` | Partner App secret |
| `PRESTASHOP_API_URL` | `https://maison-savon-marseille.ca/api/` |
| `PRESTASHOP_API_KEY` | Webservice API key (read-only) |
| `PRESTASHOP_DB_HOST` | `lgugdmyuser2.mysql.db` |
| `PRESTASHOP_DB_USER` | `lgugdmyuser2` |
| `PRESTASHOP_DB_PASSWORD` | MySQL password |
| `PRESTASHOP_DB_NAME` | Database name |
| `DATABASE_URL` | Neon connection string |
| `INNGEST_EVENT_KEY` | Inngest event key |
| `INNGEST_SIGNING_KEY` | Inngest signing key |

### Access Control

- Dashboard authenticated via Shopify session (Partner App OAuth)
- API routes verify Shopify session before execution
- PrestaShop DB access is read-only (`SELECT` only)

### Rate Limiting

- **Shopify GraphQL:** 1000 points/second budget. Sync engine respects `throttledStatus` and backs off when needed.
- **PrestaShop API:** No native rate limit. Requests are spaced to avoid overloading the OVH server.

## Infrastructure

### Vercel

- Account: dev@lxhbrand.com
- Team: LXH's projects (slug: lxhs-projects-bcfa0947)
- Project: to be created as `canada-savons-app-shopify-prestashop`

### Neon

- Project: to be created via MCP
- Branch: `main`
- Database: `canada_savons`

### Shopify Partner App

- To be created in the Shopify Partner Dashboard
- App name: `Canada Savons Gateway`
- Target store: `maison-du-savon-ca.myshopify.com`

### PrestaShop

- Webservice API: confirmed working with read access to all standard resources
- MySQL: OVH hosted, access via `lgugdmyuser2.mysql.db`
- SFTP: `ftpcloud.cluster024.hosting.ovh.net:44108` (user: lgugdmy-kevin, dir: www_ca)

## Out of Scope (v1)

- Continuous/scheduled sync (architecture supports it, not implemented in v1)
- Bidirectional sync (Shopify → PrestaShop)
- Webhook-based real-time sync
- Multi-store support
- Order creation in Shopify (read-only import or Draft Orders)
