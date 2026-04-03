# PrestaShop → Shopify Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a gateway that reads from PrestaShop (API + MySQL) and writes to Shopify (GraphQL Admin API), with a web dashboard and background job processing.

**Architecture:** Next.js app on Vercel with Neon PostgreSQL for state (ID mapping, sync logs, sessions), Inngest for background jobs. PrestaShop connector uses dual-source (REST API primary, MySQL fallback). Shopify connector uses Partner App OAuth + GraphQL.

**Tech Stack:** Next.js 15, TypeScript, Prisma, Neon PostgreSQL, Inngest, @shopify/shopify-api, Tailwind CSS, shadcn/ui, Vitest

---

## File Structure

```
├── prisma/
│   └── schema.prisma                    # Neon DB schema (mapping, logs, sessions)
├── src/
│   ├── app/
│   │   ├── layout.tsx                   # Root layout with providers
│   │   ├── page.tsx                     # Dashboard overview
│   │   ├── prestashop/
│   │   │   ├── products/page.tsx        # Browse PS products
│   │   │   ├── customers/page.tsx       # Browse PS customers
│   │   │   └── orders/page.tsx          # Browse PS orders
│   │   ├── sync/
│   │   │   ├── page.tsx                 # Launch sync
│   │   │   └── [jobId]/page.tsx         # Job tracking
│   │   ├── mapping/page.tsx             # ID mapping table
│   │   ├── logs/page.tsx                # Sync logs
│   │   └── settings/page.tsx            # Configuration
│   │   ├── api/
│   │   │   ├── prestashop/
│   │   │   │   └── [resource]/route.ts  # PS resource listing + detail
│   │   │   ├── sync/
│   │   │   │   ├── route.ts             # Launch sync
│   │   │   │   └── [jobId]/route.ts     # Job status
│   │   │   ├── mapping/route.ts         # Mapping CRUD
│   │   │   ├── logs/route.ts            # Logs listing
│   │   │   ├── inngest/route.ts         # Inngest webhook handler
│   │   │   └── auth/
│   │   │       ├── shopify/route.ts     # OAuth start
│   │   │       └── shopify/callback/route.ts # OAuth callback
│   ├── lib/
│   │   ├── prestashop/
│   │   │   ├── types.ts                 # PS resource types
│   │   │   ├── api-client.ts            # PS REST API client
│   │   │   ├── db-client.ts             # PS MySQL client
│   │   │   ├── connector.ts             # Unified connector (API + DB fallback)
│   │   │   └── registry.ts              # Resource connector registry
│   │   ├── shopify/
│   │   │   ├── types.ts                 # Shopify resource types
│   │   │   ├── auth.ts                  # OAuth setup + session management
│   │   │   ├── client.ts                # GraphQL Admin API client
│   │   │   └── connector.ts             # Shopify resource connector
│   │   ├── sync/
│   │   │   ├── types.ts                 # Sync job types
│   │   │   ├── transform.ts             # PS → Shopify transformers
│   │   │   ├── engine.ts                # Sync pipeline (extract/transform/compare/load)
│   │   │   └── hash.ts                  # Content hashing for change detection
│   │   ├── inngest/
│   │   │   ├── client.ts                # Inngest client setup
│   │   │   └── functions.ts             # Inngest job definitions
│   │   └── db.ts                        # Prisma client singleton
│   └── components/
│       ├── ui/                          # shadcn/ui components
│       ├── layout/
│       │   ├── sidebar.tsx              # Navigation sidebar
│       │   └── header.tsx               # Page header
│       ├── prestashop/
│       │   ├── product-table.tsx         # PS products data table
│       │   ├── customer-table.tsx        # PS customers data table
│       │   └── order-table.tsx           # PS orders data table
│       ├── sync/
│       │   ├── sync-launcher.tsx         # Sync config + launch form
│       │   └── job-tracker.tsx           # Real-time job progress
│       └── mapping/
│           └── mapping-table.tsx         # ID mapping data table
├── tests/
│   ├── lib/
│   │   ├── prestashop/
│   │   │   ├── api-client.test.ts
│   │   │   ├── db-client.test.ts
│   │   │   └── connector.test.ts
│   │   ├── shopify/
│   │   │   └── client.test.ts
│   │   └── sync/
│   │       ├── transform.test.ts
│   │       ├── engine.test.ts
│   │       └── hash.test.ts
│   └── api/
│       └── prestashop.test.ts
├── .env.local.example                   # Template for env vars
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

---

## Task 1: Project Scaffolding + Neon Database

Set up the Next.js project, install all dependencies, configure Prisma with Neon, and create the database schema.

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.gitignore`, `.env.local.example`, `vitest.config.ts`, `prisma/schema.prisma`, `src/lib/db.ts`

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /home/kevin/GITHUB/WILEM/canada-savons-app-shopify-prestashop
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack
```

Accept overwriting README.md. This creates the base Next.js 15 project with TypeScript, Tailwind, App Router.

- [ ] **Step 2: Install core dependencies**

```bash
npm install @shopify/shopify-api @shopify/shopify-app-session-storage-prisma prisma @prisma/client @prisma/adapter-neon @neondatabase/serverless inngest mysql2 crypto-js
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init -d
npx shadcn@latest add button card table badge input select dialog tabs separator skeleton toast dropdown-menu checkbox data-table
```

- [ ] **Step 4: Create env template**

Create `.env.local.example`:

```env
# Shopify Partner App
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://canada-savons-app-shopify-prestashop.vercel.app

# PrestaShop API
PRESTASHOP_API_URL=https://maison-savon-marseille.ca/api/
PRESTASHOP_API_KEY=

# PrestaShop Database (read-only)
PRESTASHOP_DB_HOST=lgugdmyuser2.mysql.db
PRESTASHOP_DB_USER=lgugdmyuser2
PRESTASHOP_DB_PASSWORD=
PRESTASHOP_DB_NAME=lgugdmyuser2

# Neon Database
DATABASE_URL=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

- [ ] **Step 5: Create Neon database via MCP**

Use the Neon MCP tool `create_project` to create a new project named `canada-savons`. Save the connection string.

- [ ] **Step 6: Write Prisma schema**

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model IdMapping {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  resourceType String   @map("resource_type")
  psId         Int      @map("ps_id")
  shopifyGid   String   @map("shopify_gid")
  dataHash     String?  @map("data_hash")
  lastSyncedAt DateTime @default(now()) @map("last_synced_at") @db.Timestamptz()
  syncStatus   String   @default("pending") @map("sync_status")

  @@unique([resourceType, psId])
  @@map("id_mapping")
}

model SyncLog {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  jobId        String   @map("job_id")
  resourceType String   @map("resource_type")
  psId         Int?     @map("ps_id")
  action       String
  details      Json?
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz()

  @@map("sync_logs")
}

model Session {
  id          String  @id
  shop        String
  state       String?
  isOnline    Boolean @default(false) @map("is_online")
  scope       String?
  expires     DateTime? @db.Timestamptz()
  accessToken String? @map("access_token")
  userId      BigInt?  @map("user_id")

  @@map("sessions")
}
```

- [ ] **Step 7: Push schema to Neon**

```bash
npx prisma db push
```

Expected: Tables `id_mapping`, `sync_logs`, `sessions` created in Neon.

- [ ] **Step 8: Generate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 9: Create Prisma client singleton**

Create `src/lib/db.ts`:

```typescript
import { PrismaClient } from "@prisma/client";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";

neonConfig.useSecureWebSocket = true;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 10: Create vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Add to `package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 11: Verify tests run**

```bash
npm test
```

Expected: vitest runs (0 tests found, no errors).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Prisma, Neon, and shadcn/ui"
git push origin main
```

---

## Task 2: PrestaShop API Client

Build the REST API client that talks to the PrestaShop Webservice.

**Files:**
- Create: `src/lib/prestashop/types.ts`, `src/lib/prestashop/api-client.ts`, `tests/lib/prestashop/api-client.test.ts`

- [ ] **Step 1: Write PS types**

Create `src/lib/prestashop/types.ts`:

```typescript
export interface PSMultiLangValue {
  id: string;
  value: string;
}

export interface PSProduct {
  id: number;
  id_manufacturer: string;
  id_category_default: string;
  id_default_image: string;
  reference: string;
  price: string;
  active: string;
  name: PSMultiLangValue[];
  description: PSMultiLangValue[];
  description_short: PSMultiLangValue[];
  link_rewrite: PSMultiLangValue[];
  meta_title: PSMultiLangValue[];
  meta_description: PSMultiLangValue[];
  weight: string;
  ean13: string;
  date_add: string;
  date_upd: string;
  associations: {
    categories?: { id: string }[];
    images?: { id: string }[];
    stock_availables?: { id: string; id_product_attribute: string }[];
  };
}

export interface PSCategory {
  id: number;
  id_parent: string;
  active: string;
  name: PSMultiLangValue[];
  description: PSMultiLangValue[];
  link_rewrite: PSMultiLangValue[];
}

export interface PSCustomer {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  active: string;
  date_add: string;
  date_upd: string;
}

export interface PSAddress {
  id: number;
  id_customer: string;
  firstname: string;
  lastname: string;
  company: string;
  address1: string;
  address2: string;
  postcode: string;
  city: string;
  id_country: string;
  phone: string;
  phone_mobile: string;
}

export interface PSOrder {
  id: number;
  id_customer: string;
  id_cart: string;
  id_currency: string;
  current_state: string;
  payment: string;
  total_paid: string;
  total_paid_tax_incl: string;
  total_paid_tax_excl: string;
  total_shipping: string;
  total_products: string;
  date_add: string;
  date_upd: string;
  reference: string;
  associations?: {
    order_rows?: {
      id: string;
      product_id: string;
      product_quantity: string;
      product_price: string;
      product_name: string;
    }[];
  };
}

export interface PSStockAvailable {
  id: number;
  id_product: string;
  id_product_attribute: string;
  quantity: string;
}

export interface PSImage {
  id: number;
  id_product: string;
}

export interface PSFilters {
  limit?: number;
  offset?: number;
  filter?: Record<string, string>;
  display?: string;
  sort?: string;
}

export type PSResourceType = "products" | "categories" | "customers" | "addresses" | "orders" | "stock_availables" | "combinations" | "images";

export interface PSResourceConnector<T> {
  list(filters?: PSFilters): Promise<T[]>;
  get(id: number): Promise<T>;
  search(query: string): Promise<T[]>;
}
```

- [ ] **Step 2: Write failing test for API client**

Create `tests/lib/prestashop/api-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSApiClient } from "@/lib/prestashop/api-client";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("PSApiClient", () => {
  let client: PSApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new PSApiClient(
      "https://example.com/api/",
      "test-api-key"
    );
  });

  describe("list", () => {
    it("fetches a list of resources with correct auth and format", async () => {
      const mockProducts = {
        products: [
          { id: 1, name: [{ id: "1", value: "Product 1" }] },
          { id: 2, name: [{ id: "1", value: "Product 2" }] },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProducts),
      });

      const result = await client.list("products");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/api/products"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Basic"),
          }),
        })
      );
      expect(result).toEqual(mockProducts.products);
    });

    it("applies filters to the URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ products: [] }),
      });

      await client.list("products", { limit: 10, offset: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("limit=10");
      expect(url).toContain("index=20");
    });
  });

  describe("get", () => {
    it("fetches a single resource by ID", async () => {
      const mockProduct = {
        product: { id: 1, name: [{ id: "1", value: "Product 1" }] },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProduct),
      });

      const result = await client.get("products", 1);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/api/products/1"),
        expect.any(Object)
      );
      expect(result).toEqual(mockProduct.product);
    });
  });

  describe("search", () => {
    it("searches resources by name", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ products: [{ id: 1 }] }),
      });

      await client.search("products", "savon");

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("filter%5Bname%5D=%25savon%25");
    });
  });

  describe("error handling", () => {
    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(client.list("products")).rejects.toThrow("PrestaShop API error: 401 Unauthorized");
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/lib/prestashop/api-client.test.ts
```

Expected: FAIL — cannot find module `@/lib/prestashop/api-client`.

- [ ] **Step 4: Implement PSApiClient**

Create `src/lib/prestashop/api-client.ts`:

```typescript
import type { PSFilters, PSResourceType } from "./types";

export class PSApiClient {
  private baseUrl: string;
  private authHeader: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
  }

  async list<T>(resource: PSResourceType, filters?: PSFilters): Promise<T[]> {
    const url = this.buildUrl(resource, undefined, filters);
    const data = await this.request(url);
    return data[resource] ?? [];
  }

  async get<T>(resource: PSResourceType, id: number): Promise<T> {
    const singularMap: Record<string, string> = {
      products: "product",
      categories: "category",
      customers: "customer",
      addresses: "address",
      orders: "order",
      stock_availables: "stock_available",
      combinations: "combination",
      images: "image",
    };
    const url = this.buildUrl(resource, id);
    const data = await this.request(url);
    return data[singularMap[resource] ?? resource];
  }

  async search<T>(resource: PSResourceType, query: string): Promise<T[]> {
    const url = this.buildUrl(resource, undefined, {
      filter: { name: `%${query}%` },
      display: "full",
    });
    const data = await this.request(url);
    return data[resource] ?? [];
  }

  private buildUrl(resource: PSResourceType, id?: number, filters?: PSFilters): string {
    let url = `${this.baseUrl}${resource}`;
    if (id) url += `/${id}`;

    const params = new URLSearchParams();
    params.set("output_format", "JSON");
    params.set("display", filters?.display ?? "full");

    if (filters?.limit) params.set("limit", String(filters.limit));
    if (filters?.offset) params.set("index", String(filters.offset));
    if (filters?.sort) params.set("sort", filters.sort);
    if (filters?.filter) {
      for (const [key, value] of Object.entries(filters.filter)) {
        params.set(`filter[${key}]`, value);
      }
    }

    return `${url}?${params.toString()}`;
  }

  private async request(url: string): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      headers: {
        Authorization: this.authHeader,
      },
    });

    if (!response.ok) {
      throw new Error(`PrestaShop API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/lib/prestashop/api-client.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prestashop/types.ts src/lib/prestashop/api-client.ts tests/lib/prestashop/api-client.test.ts
git commit -m "feat: add PrestaShop API client with types and tests"
```

---

## Task 3: PrestaShop MySQL Client

Build the direct MySQL client as fallback data source.

**Files:**
- Create: `src/lib/prestashop/db-client.ts`, `tests/lib/prestashop/db-client.test.ts`

- [ ] **Step 1: Write failing test for DB client**

Create `tests/lib/prestashop/db-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSDbClient } from "@/lib/prestashop/db-client";

vi.mock("mysql2/promise", () => ({
  createPool: vi.fn(() => ({
    query: vi.fn(),
    end: vi.fn(),
  })),
}));

import { createPool } from "mysql2/promise";

describe("PSDbClient", () => {
  let client: PSDbClient;
  let mockPool: { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
      end: vi.fn(),
    };
    (createPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
    client = new PSDbClient({
      host: "localhost",
      user: "test",
      password: "test",
      database: "test_db",
    });
  });

  describe("listProducts", () => {
    it("queries products with lang join and returns results", async () => {
      const mockRows = [
        { id: 1, name: "Savon", price: "10.00", active: 1 },
        { id: 2, name: "Crème", price: "20.00", active: 1 },
      ];
      mockPool.query.mockResolvedValueOnce([mockRows]);

      const result = await client.listProducts({ limit: 10, langId: 1 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ps_product"),
        expect.any(Array)
      );
      expect(result).toEqual(mockRows);
    });
  });

  describe("getProduct", () => {
    it("queries a single product by ID", async () => {
      const mockRow = { id: 1, name: "Savon", price: "10.00" };
      mockPool.query.mockResolvedValueOnce([[mockRow]]);

      const result = await client.getProduct(1, 1);

      expect(result).toEqual(mockRow);
    });

    it("returns null when product not found", async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      const result = await client.getProduct(999, 1);

      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/prestashop/db-client.test.ts
```

Expected: FAIL — cannot find module `@/lib/prestashop/db-client`.

- [ ] **Step 3: Implement PSDbClient**

Create `src/lib/prestashop/db-client.ts`:

```typescript
import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

interface PSDbFilters {
  limit?: number;
  offset?: number;
  langId?: number;
  search?: string;
}

export class PSDbClient {
  private pool: Pool;

  constructor(config: PoolOptions) {
    this.pool = mysql.createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 5,
    });
  }

  async listProducts(filters: PSDbFilters = {}): Promise<Record<string, unknown>[]> {
    const langId = filters.langId ?? 1;
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = `
      SELECT p.id_product as id, pl.name, pl.description, pl.description_short,
             pl.link_rewrite, pl.meta_title, pl.meta_description,
             p.price, p.reference, p.active, p.weight, p.ean13,
             p.id_category_default, p.id_manufacturer, p.date_add, p.date_upd
      FROM ps_product p
      JOIN ps_product_lang pl ON p.id_product = pl.id_product AND pl.id_lang = ?
      WHERE 1=1
    `;
    const params: unknown[] = [langId];

    if (filters.search) {
      query += " AND pl.name LIKE ?";
      params.push(`%${filters.search}%`);
    }

    query += " ORDER BY p.id_product DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await this.pool.query(query, params);
    return rows as Record<string, unknown>[];
  }

  async getProduct(id: number, langId: number = 1): Promise<Record<string, unknown> | null> {
    const [rows] = await this.pool.query(
      `SELECT p.id_product as id, pl.name, pl.description, pl.description_short,
              pl.link_rewrite, pl.meta_title, pl.meta_description,
              p.price, p.reference, p.active, p.weight, p.ean13,
              p.id_category_default, p.id_manufacturer, p.date_add, p.date_upd
       FROM ps_product p
       JOIN ps_product_lang pl ON p.id_product = pl.id_product AND pl.id_lang = ?
       WHERE p.id_product = ?`,
      [langId, id]
    );
    const results = rows as Record<string, unknown>[];
    return results[0] ?? null;
  }

  async listCustomers(filters: PSDbFilters = {}): Promise<Record<string, unknown>[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = `
      SELECT id_customer as id, firstname, lastname, email, active, date_add, date_upd
      FROM ps_customer
      WHERE deleted = 0
    `;
    const params: unknown[] = [];

    if (filters.search) {
      query += " AND (firstname LIKE ? OR lastname LIKE ? OR email LIKE ?)";
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    query += " ORDER BY id_customer DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const [rows] = await this.pool.query(query, params);
    return rows as Record<string, unknown>[];
  }

  async listOrders(filters: PSDbFilters = {}): Promise<Record<string, unknown>[]> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const query = `
      SELECT id_order as id, id_customer, reference, payment,
             total_paid, total_paid_tax_incl, total_paid_tax_excl,
             total_shipping, total_products, current_state, date_add, date_upd
      FROM ps_orders
      ORDER BY id_order DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await this.pool.query(query, [limit, offset]);
    return rows as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- tests/lib/prestashop/db-client.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prestashop/db-client.ts tests/lib/prestashop/db-client.test.ts
git commit -m "feat: add PrestaShop MySQL client for DB fallback"
```

---

## Task 4: PrestaShop Unified Connector

Combines API and DB clients behind one interface with automatic fallback.

**Files:**
- Create: `src/lib/prestashop/connector.ts`, `src/lib/prestashop/registry.ts`, `tests/lib/prestashop/connector.test.ts`

- [ ] **Step 1: Write failing test for unified connector**

Create `tests/lib/prestashop/connector.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSConnector } from "@/lib/prestashop/connector";
import type { PSApiClient } from "@/lib/prestashop/api-client";
import type { PSDbClient } from "@/lib/prestashop/db-client";

describe("PSConnector", () => {
  let mockApiClient: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> };
  let mockDbClient: { listProducts: ReturnType<typeof vi.fn>; getProduct: ReturnType<typeof vi.fn> };
  let connector: PSConnector;

  beforeEach(() => {
    mockApiClient = {
      list: vi.fn(),
      get: vi.fn(),
      search: vi.fn(),
    };
    mockDbClient = {
      listProducts: vi.fn(),
      getProduct: vi.fn(),
    };
    connector = new PSConnector(
      mockApiClient as unknown as PSApiClient,
      mockDbClient as unknown as PSDbClient
    );
  });

  it("uses API client by default", async () => {
    const products = [{ id: 1, name: "Savon" }];
    mockApiClient.list.mockResolvedValueOnce(products);

    const result = await connector.list("products");

    expect(mockApiClient.list).toHaveBeenCalledWith("products", undefined);
    expect(result).toEqual(products);
  });

  it("falls back to DB when API fails", async () => {
    mockApiClient.list.mockRejectedValueOnce(new Error("API error"));
    const dbProducts = [{ id: 1, name: "Savon from DB" }];
    mockDbClient.listProducts.mockResolvedValueOnce(dbProducts);

    const result = await connector.list("products");

    expect(mockDbClient.listProducts).toHaveBeenCalled();
    expect(result).toEqual(dbProducts);
  });

  it("throws when both API and DB fail", async () => {
    mockApiClient.list.mockRejectedValueOnce(new Error("API error"));
    mockDbClient.listProducts.mockRejectedValueOnce(new Error("DB error"));

    await expect(connector.list("products")).rejects.toThrow("DB error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/prestashop/connector.test.ts
```

Expected: FAIL — cannot find module `@/lib/prestashop/connector`.

- [ ] **Step 3: Implement PSConnector**

Create `src/lib/prestashop/connector.ts`:

```typescript
import type { PSFilters, PSResourceType } from "./types";
import type { PSApiClient } from "./api-client";
import type { PSDbClient } from "./db-client";

type DbListMethod = "listProducts" | "listCustomers" | "listOrders";
type DbGetMethod = "getProduct";

const DB_LIST_MAP: Partial<Record<PSResourceType, DbListMethod>> = {
  products: "listProducts",
  customers: "listCustomers",
  orders: "listOrders",
};

const DB_GET_MAP: Partial<Record<PSResourceType, DbGetMethod>> = {
  products: "getProduct",
};

export class PSConnector {
  constructor(
    private apiClient: PSApiClient,
    private dbClient: PSDbClient
  ) {}

  async list<T>(resource: PSResourceType, filters?: PSFilters): Promise<T[]> {
    try {
      return await this.apiClient.list<T>(resource, filters);
    } catch {
      const dbMethod = DB_LIST_MAP[resource];
      if (dbMethod && typeof this.dbClient[dbMethod] === "function") {
        return (await this.dbClient[dbMethod]({
          limit: filters?.limit,
          offset: filters?.offset,
        })) as T[];
      }
      throw new Error(`No DB fallback available for resource: ${resource}`);
    }
  }

  async get<T>(resource: PSResourceType, id: number): Promise<T> {
    try {
      return await this.apiClient.get<T>(resource, id);
    } catch {
      const dbMethod = DB_GET_MAP[resource];
      if (dbMethod && typeof this.dbClient[dbMethod] === "function") {
        const result = await this.dbClient[dbMethod](id);
        if (!result) throw new Error(`${resource} #${id} not found`);
        return result as T;
      }
      throw new Error(`No DB fallback available for resource: ${resource}`);
    }
  }

  async search<T>(resource: PSResourceType, query: string): Promise<T[]> {
    return this.apiClient.search<T>(resource, query);
  }
}
```

- [ ] **Step 4: Create resource registry**

Create `src/lib/prestashop/registry.ts`:

```typescript
import { PSApiClient } from "./api-client";
import { PSDbClient } from "./db-client";
import { PSConnector } from "./connector";

let connector: PSConnector | null = null;

export function getPSConnector(): PSConnector {
  if (connector) return connector;

  const apiClient = new PSApiClient(
    process.env.PRESTASHOP_API_URL!,
    process.env.PRESTASHOP_API_KEY!
  );

  const dbClient = new PSDbClient({
    host: process.env.PRESTASHOP_DB_HOST!,
    user: process.env.PRESTASHOP_DB_USER!,
    password: process.env.PRESTASHOP_DB_PASSWORD!,
    database: process.env.PRESTASHOP_DB_NAME!,
  });

  connector = new PSConnector(apiClient, dbClient);
  return connector;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- tests/lib/prestashop/connector.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/prestashop/connector.ts src/lib/prestashop/registry.ts tests/lib/prestashop/connector.test.ts
git commit -m "feat: add unified PrestaShop connector with API/DB fallback"
```

---

## Task 5: Shopify OAuth + GraphQL Client

Set up the Shopify Partner App authentication and GraphQL client.

**Files:**
- Create: `src/lib/shopify/types.ts`, `src/lib/shopify/auth.ts`, `src/lib/shopify/client.ts`, `src/app/api/auth/shopify/route.ts`, `src/app/api/auth/shopify/callback/route.ts`, `tests/lib/shopify/client.test.ts`

- [ ] **Step 1: Write Shopify types**

Create `src/lib/shopify/types.ts`:

```typescript
export interface ShopifyProduct {
  id: string; // gid://shopify/Product/123
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  handle: string;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

export interface ShopifyVariant {
  id?: string;
  title: string;
  price: string;
  sku: string;
  weight: number;
  weightUnit: "KILOGRAMS" | "GRAMS";
  barcode: string;
  inventoryQuantity?: number;
}

export interface ShopifyImage {
  id?: string;
  src: string;
  altText: string;
}

export interface ShopifyCustomer {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  addresses: ShopifyAddress[];
}

export interface ShopifyAddress {
  address1: string;
  address2?: string;
  city: string;
  province?: string;
  zip: string;
  country: string;
  phone?: string;
  company?: string;
}

export interface ShopifyCollection {
  id?: string;
  title: string;
  bodyHtml: string;
  handle: string;
}

export interface ShopifyFilters {
  first?: number;
  after?: string;
  query?: string;
}
```

- [ ] **Step 2: Create Shopify auth setup**

Create `src/lib/shopify/auth.ts`:

```typescript
import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "@/lib/db";

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  scopes: [
    "write_products", "read_products",
    "write_customers", "read_customers",
    "write_orders", "read_orders",
    "write_inventory", "read_inventory",
    "write_files", "read_files",
  ],
  hostName: process.env.SHOPIFY_APP_URL!.replace(/^https?:\/\//, ""),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: false,
});

export const sessionStorage = new PrismaSessionStorage(prisma);

export async function getSessionForShop(shop: string) {
  const sessions = await prisma.session.findMany({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  return sessions[0] ?? null;
}
```

- [ ] **Step 3: Create OAuth routes**

Create `src/app/api/auth/shopify/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify/auth";

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const authRoute = await shopify.auth.begin({
    shop,
    callbackPath: "/api/auth/shopify/callback",
    isOnline: false,
    rawRequest: request,
  });

  return NextResponse.redirect(authRoute);
}
```

Create `src/app/api/auth/shopify/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { shopify, sessionStorage } from "@/lib/shopify/auth";

export async function GET(request: NextRequest) {
  const callback = await shopify.auth.callback({
    rawRequest: request,
  });

  await sessionStorage.storeSession(callback.session);

  return NextResponse.redirect(new URL("/", request.url));
}
```

- [ ] **Step 4: Write failing test for GraphQL client**

Create `tests/lib/shopify/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShopifyClient } from "@/lib/shopify/client";

describe("ShopifyClient", () => {
  let client: ShopifyClient;
  let mockGraphqlClient: { request: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockGraphqlClient = {
      request: vi.fn(),
    };
    client = new ShopifyClient(mockGraphqlClient as any);
  });

  describe("listProducts", () => {
    it("queries products via GraphQL", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          products: {
            edges: [
              { node: { id: "gid://shopify/Product/1", title: "Savon" }, cursor: "abc" },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      });

      const result = await client.listProducts({ first: 10 });

      expect(mockGraphqlClient.request).toHaveBeenCalledWith(
        expect.stringContaining("products"),
        expect.any(Object)
      );
      expect(result.products).toHaveLength(1);
      expect(result.products[0].title).toBe("Savon");
    });
  });

  describe("createProduct", () => {
    it("creates a product via productCreate mutation", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          productCreate: {
            product: { id: "gid://shopify/Product/1", title: "Savon" },
            userErrors: [],
          },
        },
      });

      const result = await client.createProduct({
        title: "Savon",
        bodyHtml: "<p>A soap</p>",
        vendor: "La Maison du Savon",
        productType: "Soap",
        status: "DRAFT",
      });

      expect(result.id).toBe("gid://shopify/Product/1");
    });

    it("throws on user errors", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          productCreate: {
            product: null,
            userErrors: [{ field: ["title"], message: "Title is required" }],
          },
        },
      });

      await expect(
        client.createProduct({ title: "", bodyHtml: "", vendor: "", productType: "", status: "DRAFT" })
      ).rejects.toThrow("Title is required");
    });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
npm test -- tests/lib/shopify/client.test.ts
```

Expected: FAIL — cannot find module `@/lib/shopify/client`.

- [ ] **Step 6: Implement ShopifyClient**

Create `src/lib/shopify/client.ts`:

```typescript
import type { ShopifyProduct, ShopifyCustomer, ShopifyFilters } from "./types";

interface GraphQLClient {
  request(query: string, options?: { variables?: Record<string, unknown> }): Promise<{ data: Record<string, unknown> }>;
}

interface ProductsResult {
  products: ShopifyProduct[];
  pageInfo: { hasNextPage: boolean; endCursor?: string };
}

export class ShopifyClient {
  constructor(private graphql: GraphQLClient) {}

  async listProducts(filters: ShopifyFilters = {}): Promise<ProductsResult> {
    const { data } = await this.graphql.request(
      `query listProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query) {
          edges {
            node {
              id
              title
              bodyHtml
              vendor
              productType
              handle
              status
              variants(first: 100) {
                edges {
                  node { id title price sku weight weightUnit barcode }
                }
              }
              images(first: 20) {
                edges {
                  node { id src: url altText }
                }
              }
            }
            cursor
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      {
        variables: {
          first: filters.first ?? 20,
          after: filters.after ?? null,
          query: filters.query ?? null,
        },
      }
    );

    const productsData = data.products as {
      edges: { node: ShopifyProduct; cursor: string }[];
      pageInfo: { hasNextPage: boolean; endCursor?: string };
    };

    return {
      products: productsData.edges.map((e) => ({
        ...e.node,
        variants: (e.node.variants as unknown as { edges: { node: unknown }[] }).edges.map((v) => v.node) as ShopifyProduct["variants"],
        images: (e.node.images as unknown as { edges: { node: unknown }[] }).edges.map((i) => i.node) as ShopifyProduct["images"],
      })),
      pageInfo: productsData.pageInfo,
    };
  }

  async createProduct(input: {
    title: string;
    bodyHtml: string;
    vendor: string;
    productType: string;
    status: string;
    variants?: { price: string; sku: string; weight: number; barcode: string }[];
  }): Promise<ShopifyProduct> {
    const { data } = await this.graphql.request(
      `mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            title
            bodyHtml
            vendor
            productType
            handle
            status
          }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );

    const result = data.productCreate as {
      product: ShopifyProduct | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }

    return result.product!;
  }

  async updateProduct(id: string, input: Record<string, unknown>): Promise<ShopifyProduct> {
    const { data } = await this.graphql.request(
      `mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product { id title handle status }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id, ...input } } }
    );

    const result = data.productUpdate as {
      product: ShopifyProduct | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }

    return result.product!;
  }

  async createCustomer(input: {
    firstName: string;
    lastName: string;
    email: string;
    addresses?: { address1: string; city: string; zip: string; country: string }[];
  }): Promise<ShopifyCustomer> {
    const { data } = await this.graphql.request(
      `mutation customerCreate($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id firstName lastName email }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );

    const result = data.customerCreate as {
      customer: ShopifyCustomer | null;
      userErrors: { field: string[]; message: string }[];
    };

    if (result.userErrors.length > 0) {
      throw new Error(result.userErrors.map((e) => e.message).join(", "));
    }

    return result.customer!;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npm test -- tests/lib/shopify/client.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/shopify/ src/app/api/auth/ tests/lib/shopify/
git commit -m "feat: add Shopify OAuth auth and GraphQL client"
```

---

## Task 6: Sync Engine — Transform + Hash + Pipeline

Build the core sync logic: PS→Shopify transformation, content hashing, and the extract/transform/compare/load pipeline.

**Files:**
- Create: `src/lib/sync/types.ts`, `src/lib/sync/hash.ts`, `src/lib/sync/transform.ts`, `src/lib/sync/engine.ts`, `tests/lib/sync/hash.test.ts`, `tests/lib/sync/transform.test.ts`, `tests/lib/sync/engine.test.ts`

- [ ] **Step 1: Write sync types**

Create `src/lib/sync/types.ts`:

```typescript
export type SyncAction = "create" | "update" | "skip" | "error";

export interface SyncResult {
  psId: number;
  action: SyncAction;
  shopifyGid?: string;
  error?: string;
}

export interface SyncJobConfig {
  resourceType: string;
  psIds?: number[];      // specific IDs, or all if empty
  batchSize?: number;    // default 50
  dryRun?: boolean;      // preview only
}

export interface SyncJobStatus {
  jobId: string;
  resourceType: string;
  status: "running" | "completed" | "failed";
  total: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  results: SyncResult[];
}
```

- [ ] **Step 2: Write failing test for hash utility**

Create `tests/lib/sync/hash.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/sync/hash";

describe("contentHash", () => {
  it("produces a consistent hash for the same input", () => {
    const data = { name: "Savon", price: "10.00" };
    const hash1 = contentHash(data);
    const hash2 = contentHash(data);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different input", () => {
    const hash1 = contentHash({ name: "Savon" });
    const hash2 = contentHash({ name: "Crème" });
    expect(hash1).not.toBe(hash2);
  });

  it("ignores key order", () => {
    const hash1 = contentHash({ a: 1, b: 2 });
    const hash2 = contentHash({ b: 2, a: 1 });
    expect(hash1).toBe(hash2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test -- tests/lib/sync/hash.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement hash utility**

Create `src/lib/sync/hash.ts`:

```typescript
import { createHash } from "crypto";

export function contentHash(data: unknown): string {
  const sorted = JSON.stringify(data, Object.keys(data as object).sort());
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}
```

- [ ] **Step 5: Run hash test to verify it passes**

```bash
npm test -- tests/lib/sync/hash.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 6: Write failing test for transformers**

Create `tests/lib/sync/transform.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { transformProduct, transformCustomer } from "@/lib/sync/transform";
import type { PSProduct, PSCustomer } from "@/lib/prestashop/types";

describe("transformProduct", () => {
  it("transforms a PS product to Shopify format", () => {
    const psProduct: PSProduct = {
      id: 992,
      id_manufacturer: "2",
      id_category_default: "2",
      id_default_image: "1093",
      reference: "M26037",
      price: "39.000000",
      active: "1",
      name: [
        { id: "1", value: "Crème Pieds - 150ml" },
        { id: "2", value: "Foot Cream - 150ml" },
      ],
      description: [
        { id: "1", value: "<p>Description FR</p>" },
        { id: "2", value: "<p>Description EN</p>" },
      ],
      description_short: [
        { id: "1", value: "<p>Court FR</p>" },
        { id: "2", value: "<p>Short EN</p>" },
      ],
      link_rewrite: [
        { id: "1", value: "creme-pieds" },
        { id: "2", value: "foot-cream" },
      ],
      meta_title: [{ id: "1", value: "" }, { id: "2", value: "" }],
      meta_description: [{ id: "1", value: "" }, { id: "2", value: "" }],
      weight: "0.150000",
      ean13: "3760298170371",
      date_add: "2021-09-23 14:43:02",
      date_upd: "2025-10-25 11:12:00",
      associations: {
        categories: [{ id: "2" }],
        images: [{ id: "1093" }],
        stock_availables: [{ id: "5178", id_product_attribute: "0" }],
      },
    };

    const result = transformProduct(psProduct, 2); // English

    expect(result.title).toBe("Foot Cream - 150ml");
    expect(result.bodyHtml).toBe("<p>Description EN</p>");
    expect(result.vendor).toBe("La Maison du Savon de Marseille");
    expect(result.status).toBe("ACTIVE");
    expect(result.variants[0].price).toBe("39.00");
    expect(result.variants[0].sku).toBe("M26037");
    expect(result.variants[0].weight).toBe(0.15);
    expect(result.variants[0].barcode).toBe("3760298170371");
  });

  it("sets status to DRAFT when product is inactive", () => {
    const psProduct: PSProduct = {
      id: 1, id_manufacturer: "1", id_category_default: "2",
      id_default_image: "1", reference: "REF", price: "10.000000",
      active: "0",
      name: [{ id: "1", value: "Test" }],
      description: [{ id: "1", value: "" }],
      description_short: [{ id: "1", value: "" }],
      link_rewrite: [{ id: "1", value: "test" }],
      meta_title: [{ id: "1", value: "" }],
      meta_description: [{ id: "1", value: "" }],
      weight: "0", ean13: "", date_add: "", date_upd: "",
      associations: {},
    };

    const result = transformProduct(psProduct, 1);
    expect(result.status).toBe("DRAFT");
  });
});

describe("transformCustomer", () => {
  it("transforms a PS customer to Shopify format", () => {
    const psCustomer: PSCustomer = {
      id: 1,
      firstname: "Jean",
      lastname: "Dupont",
      email: "jean@example.com",
      active: "1",
      date_add: "2023-01-01",
      date_upd: "2023-06-01",
    };

    const result = transformCustomer(psCustomer);

    expect(result.firstName).toBe("Jean");
    expect(result.lastName).toBe("Dupont");
    expect(result.email).toBe("jean@example.com");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

```bash
npm test -- tests/lib/sync/transform.test.ts
```

Expected: FAIL.

- [ ] **Step 8: Implement transformers**

Create `src/lib/sync/transform.ts`:

```typescript
import type { PSProduct, PSCustomer, PSMultiLangValue } from "@/lib/prestashop/types";

function getLangValue(values: PSMultiLangValue[], langId: number): string {
  return values.find((v) => v.id === String(langId))?.value ?? values[0]?.value ?? "";
}

export function transformProduct(ps: PSProduct, langId: number = 2) {
  return {
    title: getLangValue(ps.name, langId),
    bodyHtml: getLangValue(ps.description, langId) || getLangValue(ps.description_short, langId),
    vendor: "La Maison du Savon de Marseille",
    productType: "",
    handle: getLangValue(ps.link_rewrite, langId),
    status: ps.active === "1" ? ("ACTIVE" as const) : ("DRAFT" as const),
    variants: [
      {
        price: parseFloat(ps.price).toFixed(2),
        sku: ps.reference,
        weight: parseFloat(ps.weight) || 0,
        weightUnit: "KILOGRAMS" as const,
        barcode: ps.ean13 || "",
      },
    ],
    metaTitle: getLangValue(ps.meta_title, langId),
    metaDescription: getLangValue(ps.meta_description, langId),
  };
}

export function transformCustomer(ps: PSCustomer) {
  return {
    firstName: ps.firstname,
    lastName: ps.lastname,
    email: ps.email,
  };
}
```

- [ ] **Step 9: Run transform test to verify it passes**

```bash
npm test -- tests/lib/sync/transform.test.ts
```

Expected: All 3 tests PASS.

- [ ] **Step 10: Write failing test for sync engine**

Create `tests/lib/sync/engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncEngine } from "@/lib/sync/engine";

describe("SyncEngine", () => {
  let mockPSConnector: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let mockShopifyClient: { createProduct: ReturnType<typeof vi.fn>; updateProduct: ReturnType<typeof vi.fn> };
  let mockPrisma: {
    idMapping: {
      findUnique: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
    syncLog: { create: ReturnType<typeof vi.fn> };
  };
  let engine: SyncEngine;

  beforeEach(() => {
    mockPSConnector = { list: vi.fn(), get: vi.fn() };
    mockShopifyClient = { createProduct: vi.fn(), updateProduct: vi.fn() };
    mockPrisma = {
      idMapping: { findUnique: vi.fn(), upsert: vi.fn() },
      syncLog: { create: vi.fn() },
    };
    engine = new SyncEngine(
      mockPSConnector as any,
      mockShopifyClient as any,
      mockPrisma as any
    );
  });

  it("creates a new product when no mapping exists", async () => {
    mockPSConnector.get.mockResolvedValueOnce({
      id: 1, name: [{ id: "2", value: "Savon" }],
      description: [{ id: "2", value: "<p>Test</p>" }],
      description_short: [{ id: "2", value: "" }],
      link_rewrite: [{ id: "2", value: "savon" }],
      meta_title: [{ id: "2", value: "" }],
      meta_description: [{ id: "2", value: "" }],
      price: "10.000000", active: "1", reference: "REF1",
      weight: "0.1", ean13: "", id_manufacturer: "1",
      id_category_default: "2", id_default_image: "1",
      date_add: "", date_upd: "", associations: {},
    });
    mockPrisma.idMapping.findUnique.mockResolvedValueOnce(null);
    mockShopifyClient.createProduct.mockResolvedValueOnce({
      id: "gid://shopify/Product/100",
      title: "Savon",
    });
    mockPrisma.idMapping.upsert.mockResolvedValueOnce({});
    mockPrisma.syncLog.create.mockResolvedValueOnce({});

    const result = await engine.syncSingleProduct(1, "test-job");

    expect(result.action).toBe("create");
    expect(result.shopifyGid).toBe("gid://shopify/Product/100");
    expect(mockShopifyClient.createProduct).toHaveBeenCalled();
  });

  it("skips when data hash matches", async () => {
    mockPSConnector.get.mockResolvedValueOnce({
      id: 1, name: [{ id: "2", value: "Savon" }],
      description: [{ id: "2", value: "" }],
      description_short: [{ id: "2", value: "" }],
      link_rewrite: [{ id: "2", value: "savon" }],
      meta_title: [{ id: "2", value: "" }],
      meta_description: [{ id: "2", value: "" }],
      price: "10.000000", active: "1", reference: "REF1",
      weight: "0", ean13: "", id_manufacturer: "1",
      id_category_default: "2", id_default_image: "1",
      date_add: "", date_upd: "", associations: {},
    });
    // Return a mapping with a hash that matches the transformed data
    mockPrisma.idMapping.findUnique.mockImplementation(async () => {
      // We need to compute the same hash the engine will compute
      const { contentHash } = await import("@/lib/sync/hash");
      const { transformProduct } = await import("@/lib/sync/transform");
      const transformed = transformProduct({
        id: 1, name: [{ id: "2", value: "Savon" }],
        description: [{ id: "2", value: "" }],
        description_short: [{ id: "2", value: "" }],
        link_rewrite: [{ id: "2", value: "savon" }],
        meta_title: [{ id: "2", value: "" }],
        meta_description: [{ id: "2", value: "" }],
        price: "10.000000", active: "1", reference: "REF1",
        weight: "0", ean13: "", id_manufacturer: "1",
        id_category_default: "2", id_default_image: "1",
        date_add: "", date_upd: "", associations: {},
      } as any, 2);
      return {
        shopifyGid: "gid://shopify/Product/100",
        dataHash: contentHash(transformed),
        syncStatus: "synced",
      };
    });
    mockPrisma.syncLog.create.mockResolvedValueOnce({});

    const result = await engine.syncSingleProduct(1, "test-job");

    expect(result.action).toBe("skip");
    expect(mockShopifyClient.createProduct).not.toHaveBeenCalled();
    expect(mockShopifyClient.updateProduct).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

```bash
npm test -- tests/lib/sync/engine.test.ts
```

Expected: FAIL.

- [ ] **Step 12: Implement SyncEngine**

Create `src/lib/sync/engine.ts`:

```typescript
import type { PSConnector } from "@/lib/prestashop/connector";
import type { ShopifyClient } from "@/lib/shopify/client";
import type { PrismaClient } from "@prisma/client";
import type { PSProduct, PSCustomer } from "@/lib/prestashop/types";
import type { SyncResult } from "./types";
import { transformProduct, transformCustomer } from "./transform";
import { contentHash } from "./hash";

export class SyncEngine {
  constructor(
    private ps: PSConnector,
    private shopify: ShopifyClient,
    private prisma: PrismaClient
  ) {}

  async syncSingleProduct(psId: number, jobId: string): Promise<SyncResult> {
    try {
      const psProduct = await this.ps.get<PSProduct>("products", psId);
      const transformed = transformProduct(psProduct, 2);
      const hash = contentHash(transformed);

      const existing = await (this.prisma as any).idMapping.findUnique({
        where: { resourceType_psId: { resourceType: "product", psId } },
      });

      if (existing?.dataHash === hash) {
        await this.log(jobId, "product", psId, "skip");
        return { psId, action: "skip", shopifyGid: existing.shopifyGid };
      }

      let shopifyGid: string;
      let action: "create" | "update";

      if (existing?.shopifyGid) {
        const updated = await this.shopify.updateProduct(existing.shopifyGid, transformed);
        shopifyGid = updated.id;
        action = "update";
      } else {
        const created = await this.shopify.createProduct(transformed);
        shopifyGid = created.id;
        action = "create";
      }

      await (this.prisma as any).idMapping.upsert({
        where: { resourceType_psId: { resourceType: "product", psId } },
        create: { resourceType: "product", psId, shopifyGid, dataHash: hash, syncStatus: "synced" },
        update: { shopifyGid, dataHash: hash, lastSyncedAt: new Date(), syncStatus: "synced" },
      });

      await this.log(jobId, "product", psId, action);
      return { psId, action, shopifyGid };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await this.log(jobId, "product", psId, "error", { error: message });
      return { psId, action: "error", error: message };
    }
  }

  async syncSingleCustomer(psId: number, jobId: string): Promise<SyncResult> {
    try {
      const psCustomer = await this.ps.get<PSCustomer>("customers", psId);
      const transformed = transformCustomer(psCustomer);
      const hash = contentHash(transformed);

      const existing = await (this.prisma as any).idMapping.findUnique({
        where: { resourceType_psId: { resourceType: "customer", psId } },
      });

      if (existing?.dataHash === hash) {
        await this.log(jobId, "customer", psId, "skip");
        return { psId, action: "skip", shopifyGid: existing.shopifyGid };
      }

      const created = await this.shopify.createCustomer(transformed);
      const shopifyGid = created.id!;

      await (this.prisma as any).idMapping.upsert({
        where: { resourceType_psId: { resourceType: "customer", psId } },
        create: { resourceType: "customer", psId, shopifyGid, dataHash: hash, syncStatus: "synced" },
        update: { shopifyGid, dataHash: hash, lastSyncedAt: new Date(), syncStatus: "synced" },
      });

      await this.log(jobId, "customer", psId, "create");
      return { psId, action: "create", shopifyGid };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await this.log(jobId, "customer", psId, "error", { error: message });
      return { psId, action: "error", error: message };
    }
  }

  private async log(jobId: string, resourceType: string, psId: number, action: string, details?: Record<string, unknown>) {
    await (this.prisma as any).syncLog.create({
      data: { jobId, resourceType, psId, action, details: details ?? null },
    });
  }
}
```

- [ ] **Step 13: Run all sync tests**

```bash
npm test -- tests/lib/sync/
```

Expected: All tests PASS.

- [ ] **Step 14: Commit**

```bash
git add src/lib/sync/ tests/lib/sync/
git commit -m "feat: add sync engine with transform, hash, and ETL pipeline"
```

---

## Task 7: Inngest Integration

Wire up Inngest for background job processing.

**Files:**
- Create: `src/lib/inngest/client.ts`, `src/lib/inngest/functions.ts`, `src/api/inngest/route.ts`

- [ ] **Step 1: Create Inngest client**

Create `src/lib/inngest/client.ts`:

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "canada-savons-gateway",
});
```

- [ ] **Step 2: Create Inngest functions**

Create `src/lib/inngest/functions.ts`:

```typescript
import { inngest } from "./client";
import { SyncEngine } from "@/lib/sync/engine";
import { getPSConnector } from "@/lib/prestashop/registry";
import { ShopifyClient } from "@/lib/shopify/client";
import { getSessionForShop } from "@/lib/shopify/auth";
import { shopify } from "@/lib/shopify/auth";
import { prisma } from "@/lib/db";
import type { SyncJobConfig, SyncResult } from "@/lib/sync/types";

async function createSyncEngine(shop: string): Promise<SyncEngine> {
  const session = await getSessionForShop(shop);
  if (!session?.accessToken) throw new Error(`No session for shop: ${shop}`);

  const graphqlClient = new shopify.clients.Graphql({ session: session as any });
  const shopifyClient = new ShopifyClient(graphqlClient as any);
  const psConnector = getPSConnector();

  return new SyncEngine(psConnector, shopifyClient, prisma);
}

export const syncProducts = inngest.createFunction(
  { id: "sync-products", retries: 1 },
  { event: "sync/products" },
  async ({ event, step }) => {
    const config = event.data as SyncJobConfig & { shop: string };
    const engine = await createSyncEngine(config.shop);

    const psConnector = getPSConnector();
    const allProducts = config.psIds?.length
      ? config.psIds
      : (await psConnector.list<{ id: number }>("products")).map((p) => p.id);

    const batchSize = config.batchSize ?? 50;
    const results: SyncResult[] = [];

    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      const batchResults = await step.run(`sync-batch-${i}`, async () => {
        const batchResults: SyncResult[] = [];
        for (const psId of batch) {
          const result = await engine.syncSingleProduct(psId, event.id);
          batchResults.push(result);
        }
        return batchResults;
      });
      results.push(...batchResults);
    }

    return {
      total: allProducts.length,
      created: results.filter((r) => r.action === "create").length,
      updated: results.filter((r) => r.action === "update").length,
      skipped: results.filter((r) => r.action === "skip").length,
      errors: results.filter((r) => r.action === "error").length,
    };
  }
);

export const syncCustomers = inngest.createFunction(
  { id: "sync-customers", retries: 1 },
  { event: "sync/customers" },
  async ({ event, step }) => {
    const config = event.data as SyncJobConfig & { shop: string };
    const engine = await createSyncEngine(config.shop);

    const psConnector = getPSConnector();
    const allCustomers = config.psIds?.length
      ? config.psIds
      : (await psConnector.list<{ id: number }>("customers")).map((c) => c.id);

    const batchSize = config.batchSize ?? 50;
    const results: SyncResult[] = [];

    for (let i = 0; i < allCustomers.length; i += batchSize) {
      const batch = allCustomers.slice(i, i + batchSize);
      const batchResults = await step.run(`sync-batch-${i}`, async () => {
        const batchResults: SyncResult[] = [];
        for (const psId of batch) {
          const result = await engine.syncSingleCustomer(psId, event.id);
          batchResults.push(result);
        }
        return batchResults;
      });
      results.push(...batchResults);
    }

    return {
      total: allCustomers.length,
      created: results.filter((r) => r.action === "create").length,
      skipped: results.filter((r) => r.action === "skip").length,
      errors: results.filter((r) => r.action === "error").length,
    };
  }
);

export const syncSingle = inngest.createFunction(
  { id: "sync-single", retries: 2 },
  { event: "sync/single" },
  async ({ event }) => {
    const { shop, resourceType, psId } = event.data as {
      shop: string;
      resourceType: string;
      psId: number;
    };
    const engine = await createSyncEngine(shop);

    if (resourceType === "product") {
      return engine.syncSingleProduct(psId, event.id);
    } else if (resourceType === "customer") {
      return engine.syncSingleCustomer(psId, event.id);
    }

    throw new Error(`Unsupported resource type: ${resourceType}`);
  }
);

export const inngestFunctions = [syncProducts, syncCustomers, syncSingle];
```

- [ ] **Step 3: Create Inngest API route**

Create `src/app/api/inngest/route.ts`:

```typescript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { inngestFunctions } from "@/lib/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/inngest/ src/app/api/inngest/
git commit -m "feat: add Inngest background job functions for sync"
```

---

## Task 8: API Routes

Build the REST API endpoints consumed by both the dashboard and Claude.

**Files:**
- Create: `src/app/api/prestashop/[resource]/route.ts`, `src/app/api/sync/route.ts`, `src/app/api/sync/[jobId]/route.ts`, `src/app/api/mapping/route.ts`, `src/app/api/logs/route.ts`

- [ ] **Step 1: Create PrestaShop resource API route**

Create `src/app/api/prestashop/[resource]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSResourceType } from "@/lib/prestashop/types";

const VALID_RESOURCES: PSResourceType[] = [
  "products", "categories", "customers", "addresses",
  "orders", "stock_availables", "combinations",
];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ resource: string }> }
) {
  const { resource } = await params;

  if (!VALID_RESOURCES.includes(resource as PSResourceType)) {
    return NextResponse.json({ error: `Invalid resource: ${resource}` }, { status: 400 });
  }

  const searchParams = request.nextUrl.searchParams;
  const id = searchParams.get("id");
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const connector = getPSConnector();

  if (id) {
    const item = await connector.get(resource as PSResourceType, parseInt(id));
    return NextResponse.json(item);
  }

  if (search) {
    const results = await connector.search(resource as PSResourceType, search);
    return NextResponse.json({ data: results, total: results.length });
  }

  const results = await connector.list(resource as PSResourceType, { limit, offset });
  return NextResponse.json({ data: results, limit, offset });
}
```

- [ ] **Step 2: Create sync launch API route**

Create `src/app/api/sync/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { resourceType, psIds, batchSize, shop } = body;

  if (!resourceType || !shop) {
    return NextResponse.json(
      { error: "resourceType and shop are required" },
      { status: 400 }
    );
  }

  const eventName = psIds?.length === 1
    ? "sync/single"
    : `sync/${resourceType}`;

  const { ids } = await inngest.send({
    name: eventName,
    data: {
      shop,
      resourceType,
      psIds: psIds ?? [],
      batchSize: batchSize ?? 50,
    },
  });

  return NextResponse.json({ jobId: ids[0], status: "queued" });
}
```

- [ ] **Step 3: Create sync status API route**

Create `src/app/api/sync/[jobId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const logs = await prisma.syncLog.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });

  const total = logs.length;
  const created = logs.filter((l) => l.action === "create").length;
  const updated = logs.filter((l) => l.action === "update").length;
  const skipped = logs.filter((l) => l.action === "skip").length;
  const errors = logs.filter((l) => l.action === "error").length;

  return NextResponse.json({
    jobId,
    total,
    created,
    updated,
    skipped,
    errors,
    logs,
  });
}
```

- [ ] **Step 4: Create mapping API route**

Create `src/app/api/mapping/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const resourceType = searchParams.get("resourceType");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where = resourceType ? { resourceType } : {};

  const [mappings, total] = await Promise.all([
    prisma.idMapping.findMany({
      where,
      orderBy: { lastSyncedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.idMapping.count({ where }),
  ]);

  return NextResponse.json({ data: mappings, total, limit, offset });
}
```

- [ ] **Step 5: Create logs API route**

Create `src/app/api/logs/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");
  const resourceType = searchParams.get("resourceType");
  const action = searchParams.get("action");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (jobId) where.jobId = jobId;
  if (resourceType) where.resourceType = resourceType;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.syncLog.count({ where }),
  ]);

  return NextResponse.json({ data: logs, total, limit, offset });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/
git commit -m "feat: add API routes for PS browsing, sync, mapping, and logs"
```

---

## Task 9: Dashboard — Layout + Overview

Build the shell layout (sidebar, header) and the overview page.

**Files:**
- Create: `src/components/layout/sidebar.tsx`, `src/components/layout/header.tsx`, `src/app/layout.tsx` (modify), `src/app/page.tsx` (modify)

- [ ] **Step 1: Create sidebar component**

Create `src/components/layout/sidebar.tsx`:

```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Overview", href: "/" },
  { label: "Products", href: "/prestashop/products" },
  { label: "Customers", href: "/prestashop/customers" },
  { label: "Orders", href: "/prestashop/orders" },
  { label: "Sync", href: "/sync" },
  { label: "Mapping", href: "/mapping" },
  { label: "Logs", href: "/logs" },
  { label: "Settings", href: "/settings" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/40 p-4">
      <div className="mb-8">
        <h1 className="text-lg font-bold">Canada Savons</h1>
        <p className="text-xs text-muted-foreground">PS → Shopify Gateway</p>
      </div>
      <nav className="space-y-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Update root layout**

Modify `src/app/layout.tsx` to include the sidebar:

```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Canada Savons Gateway",
  description: "PrestaShop to Shopify migration gateway",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create overview page**

Modify `src/app/page.tsx`:

```typescript
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const [totalMappings, recentLogs, errorCount] = await Promise.all([
    prisma.idMapping.count(),
    prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.syncLog.count({ where: { action: "error" } }),
  ]);

  const syncedProducts = await prisma.idMapping.count({ where: { resourceType: "product" } });
  const syncedCustomers = await prisma.idMapping.count({ where: { resourceType: "customer" } });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Synced</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalMappings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Products</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{syncedProducts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{syncedCustomers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{errorCount}</p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentLogs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="p-3">{log.resourceType}</td>
                <td className="p-3">{log.psId}</td>
                <td className="p-3">
                  <span className={
                    log.action === "error" ? "text-destructive" :
                    log.action === "create" ? "text-green-600" :
                    log.action === "update" ? "text-blue-600" :
                    "text-muted-foreground"
                  }>
                    {log.action}
                  </span>
                </td>
                <td className="p-3 text-muted-foreground">
                  {log.createdAt.toLocaleString()}
                </td>
              </tr>
            ))}
            {recentLogs.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={4}>
                  No sync activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: Build succeeds (or minor warnings — no errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/ src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add dashboard layout with sidebar and overview page"
```

---

## Task 10: Dashboard — PrestaShop Browser Pages

Build the pages to browse PS products, customers, and orders.

**Files:**
- Create: `src/components/prestashop/product-table.tsx`, `src/components/prestashop/customer-table.tsx`, `src/components/prestashop/order-table.tsx`, `src/app/prestashop/products/page.tsx`, `src/app/prestashop/customers/page.tsx`, `src/app/prestashop/orders/page.tsx`

- [ ] **Step 1: Create product table component**

Create `src/components/prestashop/product-table.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PSProductRow {
  id: number;
  name: { id: string; value: string }[];
  price: string;
  active: string;
  reference: string;
  date_upd: string;
}

export function ProductTable() {
  const [products, setProducts] = useState<PSProductRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  async function fetchProducts() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/prestashop/products?${params}`);
    const json = await res.json();
    setProducts(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchProducts(); }, [offset]);

  function getName(product: PSProductRow, langId: string = "2") {
    return product.name?.find((n) => n.id === langId)?.value ?? product.name?.[0]?.value ?? "—";
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchProducts()}
        />
        <Button onClick={fetchProducts}>Search</Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Reference</th>
              <th className="p-3 text-left">Price</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Loading...</td></tr>
            ) : products.map((p) => (
              <tr key={p.id} className="border-b">
                <td className="p-3">{p.id}</td>
                <td className="p-3">{getName(p)}</td>
                <td className="p-3 font-mono text-xs">{p.reference}</td>
                <td className="p-3">{parseFloat(p.price).toFixed(2)} $</td>
                <td className="p-3">
                  <Badge variant={p.active === "1" ? "default" : "secondary"}>
                    {p.active === "1" ? "Active" : "Inactive"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + products.length}</span>
        <Button variant="outline" disabled={products.length < limit} onClick={() => setOffset(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create customer table component**

Create `src/components/prestashop/customer-table.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PSCustomerRow {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  active: string;
  date_add: string;
}

export function CustomerTable() {
  const [customers, setCustomers] = useState<PSCustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  async function fetchCustomers() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    const res = await fetch(`/api/prestashop/customers?${params}`);
    const json = await res.json();
    setCustomers(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchCustomers(); }, [offset]);

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && fetchCustomers()}
        />
        <Button onClick={fetchCustomers}>Search</Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">Email</th>
              <th className="p-3 text-left">Registered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">Loading...</td></tr>
            ) : customers.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="p-3">{c.id}</td>
                <td className="p-3">{c.firstname} {c.lastname}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3 text-muted-foreground">{c.date_add}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + customers.length}</span>
        <Button variant="outline" disabled={customers.length < limit} onClick={() => setOffset(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create order table component**

Create `src/components/prestashop/order-table.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface PSOrderRow {
  id: number;
  reference: string;
  id_customer: string;
  payment: string;
  total_paid: string;
  current_state: string;
  date_add: string;
}

export function OrderTable() {
  const [orders, setOrders] = useState<PSOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  async function fetchOrders() {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetch(`/api/prestashop/orders?${params}`);
    const json = await res.json();
    setOrders(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => { fetchOrders(); }, [offset]);

  return (
    <div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">Reference</th>
              <th className="p-3 text-left">Customer</th>
              <th className="p-3 text-left">Payment</th>
              <th className="p-3 text-left">Total</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Loading...</td></tr>
            ) : orders.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="p-3">{o.id}</td>
                <td className="p-3 font-mono text-xs">{o.reference}</td>
                <td className="p-3">#{o.id_customer}</td>
                <td className="p-3">{o.payment}</td>
                <td className="p-3">{parseFloat(o.total_paid).toFixed(2)} $</td>
                <td className="p-3 text-muted-foreground">{o.date_add}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-between mt-4">
        <Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <span className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + orders.length}</span>
        <Button variant="outline" disabled={orders.length < limit} onClick={() => setOffset(offset + limit)}>
          Next
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create page files**

Create `src/app/prestashop/products/page.tsx`:

```typescript
import { ProductTable } from "@/components/prestashop/product-table";

export default function ProductsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Products</h1>
      <ProductTable />
    </div>
  );
}
```

Create `src/app/prestashop/customers/page.tsx`:

```typescript
import { CustomerTable } from "@/components/prestashop/customer-table";

export default function CustomersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Customers</h1>
      <CustomerTable />
    </div>
  );
}
```

Create `src/app/prestashop/orders/page.tsx`:

```typescript
import { OrderTable } from "@/components/prestashop/order-table";

export default function OrdersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">PrestaShop Orders</h1>
      <OrderTable />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/prestashop/ src/app/prestashop/
git commit -m "feat: add dashboard pages to browse PS products, customers, orders"
```

---

## Task 11: Dashboard — Sync, Mapping, Logs, Settings Pages

Build the remaining dashboard pages.

**Files:**
- Create: `src/components/sync/sync-launcher.tsx`, `src/components/sync/job-tracker.tsx`, `src/components/mapping/mapping-table.tsx`, `src/app/sync/page.tsx`, `src/app/sync/[jobId]/page.tsx`, `src/app/mapping/page.tsx`, `src/app/logs/page.tsx`, `src/app/settings/page.tsx`

- [ ] **Step 1: Create sync launcher component**

Create `src/components/sync/sync-launcher.tsx`:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SyncLauncher({ shop }: { shop: string }) {
  const router = useRouter();
  const [resourceType, setResourceType] = useState("products");
  const [psIds, setPsIds] = useState("");
  const [batchSize, setBatchSize] = useState("50");
  const [launching, setLaunching] = useState(false);

  async function handleLaunch() {
    setLaunching(true);
    const body: Record<string, unknown> = {
      resourceType,
      shop,
      batchSize: parseInt(batchSize),
    };
    if (psIds.trim()) {
      body.psIds = psIds.split(",").map((id) => parseInt(id.trim()));
    }

    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLaunching(false);

    if (data.jobId) {
      router.push(`/sync/${data.jobId}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Launch Sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Resource Type</label>
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="products">Products</SelectItem>
              <SelectItem value="customers">Customers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-sm font-medium">Specific PS IDs (optional, comma-separated)</label>
          <Input
            placeholder="e.g. 992,993,994"
            value={psIds}
            onChange={(e) => setPsIds(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Batch Size</label>
          <Input
            type="number"
            value={batchSize}
            onChange={(e) => setBatchSize(e.target.value)}
          />
        </div>

        <Button onClick={handleLaunch} disabled={launching} className="w-full">
          {launching ? "Launching..." : "Start Sync"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create job tracker component**

Create `src/components/sync/job-tracker.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface JobStatus {
  jobId: string;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  logs: { id: string; resourceType: string; psId: number; action: string; details: unknown; createdAt: string }[];
}

export function JobTracker({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<JobStatus | null>(null);

  async function fetchStatus() {
    const res = await fetch(`/api/sync/${jobId}`);
    const data = await res.json();
    setStatus(data);
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  if (!status) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total", value: status.total, color: "" },
          { label: "Created", value: status.created, color: "text-green-600" },
          { label: "Updated", value: status.updated, color: "text-blue-600" },
          { label: "Skipped", value: status.skipped, color: "text-muted-foreground" },
          { label: "Errors", value: status.errors, color: "text-destructive" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{stat.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Details</th>
              <th className="p-3 text-left">Time</th>
            </tr>
          </thead>
          <tbody>
            {status.logs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="p-3">{log.resourceType}</td>
                <td className="p-3">{log.psId}</td>
                <td className="p-3">
                  <Badge variant={log.action === "error" ? "destructive" : "default"}>
                    {log.action}
                  </Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground">
                  {log.details ? JSON.stringify(log.details) : "—"}
                </td>
                <td className="p-3 text-muted-foreground">{new Date(log.createdAt).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create sync pages**

Create `src/app/sync/page.tsx`:

```typescript
import { SyncLauncher } from "@/components/sync/sync-launcher";

export default function SyncPage() {
  const shop = "maison-du-savon-ca.myshopify.com";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sync PrestaShop → Shopify</h1>
      <div className="max-w-md">
        <SyncLauncher shop={shop} />
      </div>
    </div>
  );
}
```

Create `src/app/sync/[jobId]/page.tsx`:

```typescript
import { JobTracker } from "@/components/sync/job-tracker";

export default async function JobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Sync Job</h1>
      <p className="text-sm text-muted-foreground mb-6 font-mono">{jobId}</p>
      <JobTracker jobId={jobId} />
    </div>
  );
}
```

- [ ] **Step 4: Create mapping page**

Create `src/app/mapping/page.tsx`:

```typescript
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function MappingPage() {
  const mappings = await prisma.idMapping.findMany({
    orderBy: { lastSyncedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ID Mapping (PS ↔ Shopify)</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Shopify GID</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Last Synced</th>
            </tr>
          </thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-3">{m.resourceType}</td>
                <td className="p-3">{m.psId}</td>
                <td className="p-3 font-mono text-xs">{m.shopifyGid}</td>
                <td className="p-3">
                  <Badge variant={m.syncStatus === "error" ? "destructive" : "default"}>
                    {m.syncStatus}
                  </Badge>
                </td>
                <td className="p-3 text-muted-foreground">{m.lastSyncedAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create logs page**

Create `src/app/logs/page.tsx`:

```typescript
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sync Logs</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-3 text-left">Job</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">PS ID</th>
              <th className="p-3 text-left">Action</th>
              <th className="p-3 text-left">Details</th>
              <th className="p-3 text-left">Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b">
                <td className="p-3 font-mono text-xs">{log.jobId.slice(0, 8)}...</td>
                <td className="p-3">{log.resourceType}</td>
                <td className="p-3">{log.psId}</td>
                <td className="p-3">
                  <Badge variant={log.action === "error" ? "destructive" : "default"}>
                    {log.action}
                  </Badge>
                </td>
                <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                  {log.details ? JSON.stringify(log.details) : "—"}
                </td>
                <td className="p-3 text-muted-foreground">{log.createdAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create settings page**

Create `src/app/settings/page.tsx`:

```typescript
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const shop = "maison-du-savon-ca.myshopify.com";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6 max-w-lg">
        <Card>
          <CardHeader>
            <CardTitle>Shopify Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">Store: {shop}</p>
            <Button asChild>
              <a href={`/api/auth/shopify?shop=${shop}`}>Connect to Shopify</a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PrestaShop</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              API and database connections are configured via environment variables on Vercel.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/sync/ src/components/mapping/ src/app/sync/ src/app/mapping/ src/app/logs/ src/app/settings/
git commit -m "feat: add sync launcher, job tracker, mapping, logs, and settings pages"
```

---

## Task 12: Vercel Deployment + Shopify Partner App Setup

Deploy to Vercel and configure the Shopify Partner App.

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Update next.config.ts for Vercel**

Modify `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mysql2"],
};

export default nextConfig;
```

This ensures mysql2 (native module) is bundled correctly on Vercel.

- [ ] **Step 2: Deploy to Vercel via MCP**

Use the Vercel MCP tool `deploy_to_vercel` with:
- Project name: `canada-savons-app-shopify-prestashop`
- Team: `lxhs-projects-bcfa0947`
- Framework: Next.js

- [ ] **Step 3: Set Vercel environment variables**

Using the Vercel dashboard or CLI, set all environment variables from `.env.local.example` with actual values:
- `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` — from Shopify Partner App (created in step 4)
- `PRESTASHOP_API_URL` = `https://maison-savon-marseille.ca/api/`
- `PRESTASHOP_API_KEY` = the API key
- `PRESTASHOP_DB_HOST` = `lgugdmyuser2.mysql.db`
- `PRESTASHOP_DB_USER` = `lgugdmyuser2`
- `PRESTASHOP_DB_PASSWORD` = the password
- `PRESTASHOP_DB_NAME` = `lgugdmyuser2`
- `DATABASE_URL` = Neon connection string from Task 1
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` — from Inngest dashboard after creating the app

- [ ] **Step 4: Create Shopify Partner App**

In the Shopify Partner Dashboard (kevin@wilem-group.com):
1. Create new app: "Canada Savons Gateway"
2. Set App URL: `https://canada-savons-app-shopify-prestashop.vercel.app`
3. Set Redirect URLs: `https://canada-savons-app-shopify-prestashop.vercel.app/api/auth/shopify/callback`
4. Copy Client ID → `SHOPIFY_API_KEY`
5. Copy Client Secret → `SHOPIFY_API_SECRET`
6. Update Vercel env vars with these values

- [ ] **Step 5: Set up Inngest**

1. Go to Inngest dashboard, create app "canada-savons-gateway"
2. Copy Event Key → `INNGEST_EVENT_KEY`
3. Copy Signing Key → `INNGEST_SIGNING_KEY`
4. Set the Inngest app URL to `https://canada-savons-app-shopify-prestashop.vercel.app/api/inngest`
5. Update Vercel env vars

- [ ] **Step 6: Redeploy and verify**

```bash
git push origin main
```

Trigger a redeploy on Vercel. Visit the deployed URL and verify:
- Dashboard loads with sidebar navigation
- `/settings` page shows "Connect to Shopify" button
- OAuth flow works when clicking "Connect to Shopify"

- [ ] **Step 7: Commit any config changes**

```bash
git add -A
git commit -m "feat: configure Vercel deployment and Shopify Partner App"
git push origin main
```

---

## Task 13: End-to-End Verification

Verify the full flow works: browse PS data, launch a sync, see results.

- [ ] **Step 1: Verify PS API browsing**

Visit `/prestashop/products` on the deployed app. Confirm products load from PrestaShop API.

- [ ] **Step 2: Connect Shopify**

Visit `/settings` and click "Connect to Shopify". Complete the OAuth flow for `maison-du-savon-ca.myshopify.com`.

- [ ] **Step 3: Test single product sync**

Visit `/sync`, enter a single PS product ID (e.g., `992`), and launch the sync. Follow the job tracker to verify:
- Product appears in Shopify admin
- ID mapping is created in Neon
- Sync log entry is created

- [ ] **Step 4: Verify mapping page**

Visit `/mapping` and confirm the synced product appears with status "synced".

- [ ] **Step 5: Verify logs page**

Visit `/logs` and confirm the sync action appears.

- [ ] **Step 6: Test skip on re-sync**

Re-sync the same product ID. Verify it results in a "skip" action (hash unchanged).

- [ ] **Step 7: Update Linear issues**

Mark completed Linear issues as Done via the API:
- LXH-186: Setup projet Next.js + Vercel
- LXH-187: Connecteur PrestaShop (API + BDD)
- LXH-188: Connecteur Shopify (Partner App + OAuth + GraphQL)
- LXH-189: Base Neon (mapping, logs, sessions)
- LXH-190: Sync Engine (Extract → Transform → Compare → Load)
- LXH-191: Dashboard (browse PS, sync, mapping, logs)
