# Sync V2 — Déduplication, Détails, Commandes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add customer/order detail panels, deduplicate products during sync, import completed PS orders into Shopify, and replace Inngest with self-chaining batches.

**Architecture:** Extend existing PS→Shopify gateway with: (1) two new API routes + UI panels for customer/order detail, (2) Shopify GraphQL search methods for dedup before create, (3) new `syncSingleOrder` with auto-resolution of customer+product dependencies, (4) refactored sync API using `after()` self-chaining instead of Inngest.

**Tech Stack:** Next.js 16, Shopify GraphQL Admin API, PrestaShop REST API, Prisma/Neon, Vercel Functions with `after()`.

**Spec:** `docs/superpowers/specs/2026-04-09-sync-v2-dedup-details-orders-design.md`

---

### Task 1: Customer Detail — API Route

**Files:**
- Create: `src/app/api/customers/[id]/route.ts`

- [ ] **Step 1: Create the customer detail API route**

Create `src/app/api/customers/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSCustomer, PSAddress, PSOrder } from "@/lib/prestashop/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const psId = parseInt(id);
  if (isNaN(psId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const ps = getPSConnector();

    const [customer, addresses, orders] = await Promise.all([
      ps.get<PSCustomer>("customers", psId),
      ps.list<PSAddress>("addresses", { display: "full", filter: { id_customer: String(psId) } }),
      ps.list<PSOrder>("orders", { display: "full", filter: { id_customer: String(psId) } }),
    ]);

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json({
      psId: customer.id,
      firstname: customer.firstname,
      lastname: customer.lastname,
      email: customer.email,
      active: customer.active === "1",
      dateAdd: customer.date_add,
      addresses: addresses.map((a) => ({
        address1: a.address1,
        address2: a.address2 || null,
        city: a.city,
        postcode: a.postcode,
        phone: a.phone || a.phone_mobile || null,
        company: a.company || null,
      })),
      orders: orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        totalPaid: o.total_paid,
        dateAdd: o.date_add,
        currentState: o.current_state,
        payment: o.payment,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the route works**

Run: `curl -s "https://canada-savons-app-shopify-prestasho.vercel.app/api/customers/1" | python3 -m json.tool | head -15`

(Test locally first with `npm run dev` if possible, or deploy to verify.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/customers/[id]/route.ts
git commit -m "feat: add customer detail API route"
```

---

### Task 2: Customer Detail — UI Panel + Page Wiring

**Files:**
- Create: `src/components/prestashop/customer-detail-panel.tsx`
- Modify: `src/app/(dashboard)/prestashop/customers/page.tsx`
- Modify: `src/components/prestashop/customer-table.tsx`

- [ ] **Step 1: Create CustomerDetailPanel component**

Create `src/components/prestashop/customer-detail-panel.tsx`. Follow the exact same pattern as `src/components/prestashop/product-detail-panel.tsx` — slide-out panel 420px, fixed right, loading skeleton, close button.

Sections to display:
- **Header**: "Client #{psId}"
- **Infos**: firstname, lastname, email, active badge, dateAdd
- **Addresses**: for each address, render a card with address1, city, postcode, phone
- **Orders**: mini-table with columns: Réf, Date, Montant, Paiement

Fetch from: `GET /api/customers/${psId}`

Interface:
```typescript
interface CustomerDetail {
  psId: number;
  firstname: string;
  lastname: string;
  email: string;
  active: boolean;
  dateAdd: string;
  addresses: { address1: string; address2: string | null; city: string; postcode: string; phone: string | null; company: string | null }[];
  orders: { id: number; reference: string; totalPaid: string; dateAdd: string; currentState: string; payment: string }[];
}
```

- [ ] **Step 2: Make customer table rows clickable**

Modify `src/components/prestashop/customer-table.tsx`:
- Add `onSelectCustomer` prop: `(customer: { psId: number }) => void`
- Add `onClick={() => onSelectCustomer({ psId: c.id })}` on each table row
- Add `cursor-pointer hover:bg-muted/50` classes to rows

- [ ] **Step 3: Wire up page with panel**

Modify `src/app/(dashboard)/prestashop/customers/page.tsx`:
- Add `useState<number | null>(null)` for `selectedPsId`
- Pass `onSelectCustomer` to `CustomerTable`
- Render `CustomerDetailPanel` when `selectedPsId` is set

```typescript
"use client";

import { useState } from "react";
import { CustomerTable } from "@/components/prestashop/customer-table";
import { CustomerDetailPanel } from "@/components/prestashop/customer-detail-panel";

export default function CustomersPage() {
  const [selectedPsId, setSelectedPsId] = useState<number | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients PrestaShop</h1>
      </div>
      <CustomerTable onSelectCustomer={(c) => setSelectedPsId(c.psId)} />
      {selectedPsId && (
        <CustomerDetailPanel psId={selectedPsId} onClose={() => setSelectedPsId(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/prestashop/customer-detail-panel.tsx src/components/prestashop/customer-table.tsx src/app/\(dashboard\)/prestashop/customers/page.tsx
git commit -m "feat: customer detail panel with addresses and orders"
```

---

### Task 3: Order Detail — API Route

**Files:**
- Create: `src/app/api/orders/[id]/route.ts`

- [ ] **Step 1: Create the order detail API route**

Create `src/app/api/orders/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSOrder, PSCustomer } from "@/lib/prestashop/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const psId = parseInt(id);
  if (isNaN(psId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const ps = getPSConnector();
    const order = await ps.get<PSOrder>("orders", psId);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Fetch customer info
    let customer: { id: number; firstname: string; lastname: string; email: string } | null = null;
    try {
      const psCustomer = await ps.get<PSCustomer>("customers", parseInt(order.id_customer));
      customer = {
        id: psCustomer.id,
        firstname: psCustomer.firstname,
        lastname: psCustomer.lastname,
        email: psCustomer.email,
      };
    } catch {
      // Customer may not exist
    }

    const orderRows = (order.associations?.order_rows ?? []).map((row) => ({
      productId: parseInt(row.product_id),
      productName: row.product_name,
      productQuantity: parseInt(row.product_quantity),
      productPrice: row.product_price,
    }));

    return NextResponse.json({
      psId: order.id,
      reference: order.reference,
      dateAdd: order.date_add,
      currentState: order.current_state,
      payment: order.payment,
      totalProducts: order.total_products,
      totalShipping: order.total_shipping,
      totalPaidTaxIncl: order.total_paid_tax_incl,
      totalPaidTaxExcl: order.total_paid_tax_excl,
      customer,
      orderRows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/orders/[id]/route.ts
git commit -m "feat: add order detail API route"
```

---

### Task 4: Order Detail — UI Panel + Page Wiring

**Files:**
- Create: `src/components/prestashop/order-detail-panel.tsx`
- Modify: `src/app/(dashboard)/prestashop/orders/page.tsx`
- Modify: `src/components/prestashop/order-table.tsx`

- [ ] **Step 1: Create OrderDetailPanel component**

Create `src/components/prestashop/order-detail-panel.tsx`. Same slide-out pattern.

Sections:
- **Header**: "Commande #{psId} — {reference}"
- **Client**: firstname + lastname + email (or "Client inconnu")
- **Lignes**: table with columns: Produit, Qté, Prix unitaire, Sous-total
- **Totaux**: total produits, frais livraison, total TTC

Interface:
```typescript
interface OrderDetail {
  psId: number;
  reference: string;
  dateAdd: string;
  currentState: string;
  payment: string;
  totalProducts: string;
  totalShipping: string;
  totalPaidTaxIncl: string;
  totalPaidTaxExcl: string;
  customer: { id: number; firstname: string; lastname: string; email: string } | null;
  orderRows: { productId: number; productName: string; productQuantity: number; productPrice: string }[];
}
```

- [ ] **Step 2: Make order table rows clickable**

Modify `src/components/prestashop/order-table.tsx`:
- Add `onSelectOrder` prop: `(order: { psId: number }) => void`
- Add onClick + cursor-pointer on rows

- [ ] **Step 3: Wire up page with panel**

Modify `src/app/(dashboard)/prestashop/orders/page.tsx` — same pattern as customers page.

- [ ] **Step 4: Commit**

```bash
git add src/components/prestashop/order-detail-panel.tsx src/components/prestashop/order-table.tsx src/app/\(dashboard\)/prestashop/orders/page.tsx
git commit -m "feat: order detail panel with line items and totals"
```

---

### Task 5: Shopify Client — Dedup Search Methods

**Files:**
- Modify: `src/lib/shopify/client.ts`

- [ ] **Step 1: Add findExistingProduct method**

Add to `ShopifyClient` class in `src/lib/shopify/client.ts`:

```typescript
async findExistingProduct(sku: string, title: string): Promise<string | null> {
  // Search by SKU first
  if (sku) {
    const { products } = await this.listProducts({ first: 1, query: `sku:${sku}` });
    if (products.length > 0) return products[0].id;
  }
  // Fallback: search by title
  if (title) {
    const { products } = await this.listProducts({ first: 1, query: `title:${title}` });
    if (products.length > 0) return products[0].id;
  }
  return null;
}
```

- [ ] **Step 2: Add findCustomerByEmail method**

Add to `ShopifyClient` class:

```typescript
async findCustomerByEmail(email: string): Promise<string | null> {
  const { data } = await this.graphql.request(
    `query findCustomer($query: String!) {
      customers(first: 1, query: $query) {
        edges { node { id } }
      }
    }`,
    { variables: { query: `email:${email}` } }
  );
  const customers = data.customers as { edges: { node: { id: string } }[] };
  return customers.edges.length > 0 ? customers.edges[0].node.id : null;
}
```

- [ ] **Step 3: Add createOrder method**

Add to `ShopifyClient` class:

```typescript
async createOrder(input: {
  customerId: string;
  lineItems: { variantId: string; quantity: number }[];
  billingAddress?: Record<string, string>;
  shippingAddress?: Record<string, string>;
  financialStatus: string;
  note: string;
  tags: string[];
}): Promise<{ id: string }> {
  const { data } = await this.graphql.request(
    `mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        order: {
          customerId: input.customerId,
          lineItems: input.lineItems,
          billingAddress: input.billingAddress,
          shippingAddress: input.shippingAddress,
          financialStatus: input.financialStatus,
          note: input.note,
          tags: input.tags,
        },
        options: { inventoryBehaviour: "BYPASS" },
      },
    }
  );

  const result = data.orderCreate as {
    order: { id: string } | null;
    userErrors: { field: string[]; message: string }[];
  };

  if (result.userErrors.length > 0) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }
  return result.order!;
}
```

Note: The exact GraphQL mutation schema for `orderCreate` must be verified against the Shopify Admin API docs for the April 2026 API version. The agent implementing this task MUST check the Shopify GraphQL schema using context7 or the Shopify docs to confirm the correct mutation input types.

- [ ] **Step 4: Commit**

```bash
git add src/lib/shopify/client.ts
git commit -m "feat: add Shopify dedup search + order creation methods"
```

---

### Task 6: Sync Engine — Product Dedup

**Files:**
- Modify: `src/lib/sync/engine.ts`

- [ ] **Step 1: Add dedup logic to syncSingleProduct**

In `src/lib/sync/engine.ts`, modify `syncSingleProduct`. After the `existing` check and before creating, add dedup search:

Replace the `else` branch (the create path) in `syncSingleProduct`:

```typescript
// Current code (line 38-41):
// } else {
//   const created = await this.shopify.createProduct(transformed);
//   shopifyGid = created.id;
//   action = "create";
// }

// New code:
} else {
  // Dedup: search Shopify for existing product by SKU then title
  const existingGid = await this.shopify.findExistingProduct(
    transformed.variants?.[0]?.sku || "",
    transformed.title
  );

  if (existingGid) {
    // Found in Shopify but no local mapping — reconcile
    const updated = await this.shopify.updateProduct(existingGid, transformed);
    shopifyGid = updated.id;
    action = "update";
  } else {
    const created = await this.shopify.createProduct(transformed);
    shopifyGid = created.id;
    action = "create";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sync/engine.ts
git commit -m "feat: product dedup — match by SKU then title before create"
```

---

### Task 7: Sync Engine — Customer Dedup + Update

**Files:**
- Modify: `src/lib/sync/engine.ts`
- Modify: `src/lib/shopify/client.ts` (add updateCustomer)

- [ ] **Step 1: Add updateCustomer to ShopifyClient**

Add to `ShopifyClient` in `src/lib/shopify/client.ts`:

```typescript
async updateCustomer(id: string, input: Record<string, unknown>): Promise<ShopifyCustomer> {
  const { data } = await this.graphql.request(
    `mutation customerUpdate($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer { id firstName lastName email }
        userErrors { field message }
      }
    }`,
    { variables: { input: { id, ...input } } }
  );

  const result = data.customerUpdate as {
    customer: ShopifyCustomer | null;
    userErrors: { field: string[]; message: string }[];
  };

  if (result.userErrors.length > 0) {
    throw new Error(result.userErrors.map((e) => e.message).join(", "));
  }
  return result.customer!;
}
```

- [ ] **Step 2: Rewrite syncSingleCustomer with dedup + update**

Replace `syncSingleCustomer` in `src/lib/sync/engine.ts`:

```typescript
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

    let shopifyGid: string;
    let action: "create" | "update";

    if (existing?.shopifyGid) {
      const updated = await this.shopify.updateCustomer(existing.shopifyGid, transformed);
      shopifyGid = updated.id!;
      action = "update";
    } else {
      // Dedup: search Shopify by email
      const existingGid = await this.shopify.findCustomerByEmail(transformed.email);

      if (existingGid) {
        const updated = await this.shopify.updateCustomer(existingGid, transformed);
        shopifyGid = updated.id!;
        action = "update";
      } else {
        const created = await this.shopify.createCustomer(transformed);
        shopifyGid = created.id!;
        action = "create";
      }
    }

    await (this.prisma as any).idMapping.upsert({
      where: { resourceType_psId: { resourceType: "customer", psId } },
      create: { resourceType: "customer", psId, shopifyGid, dataHash: hash, syncStatus: "synced" },
      update: { shopifyGid, dataHash: hash, lastSyncedAt: new Date(), syncStatus: "synced" },
    });

    await this.log(jobId, "customer", psId, action);
    return { psId, action, shopifyGid };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await this.log(jobId, "customer", psId, "error", { error: message });
    return { psId, action: "error", error: message };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/engine.ts src/lib/shopify/client.ts
git commit -m "feat: customer dedup by email + update support"
```

---

### Task 8: Sync Engine — Order Sync with Auto-Resolution

**Files:**
- Modify: `src/lib/sync/engine.ts`
- Modify: `src/lib/sync/transform.ts`
- Modify: `src/lib/prestashop/types.ts` (if PSAddress not complete)

- [ ] **Step 1: Add transformOrder to transform.ts**

Add to `src/lib/sync/transform.ts`:

```typescript
export function transformOrder(
  order: PSOrder,
  customerGid: string,
  lineItems: { variantId: string; quantity: number }[],
  shippingAddress?: Record<string, string>,
  billingAddress?: Record<string, string>
) {
  return {
    customerId: customerGid,
    lineItems,
    shippingAddress,
    billingAddress,
    financialStatus: "PAID",
    note: `Imported from PrestaShop — Ref: ${order.reference}`,
    tags: ["prestashop-import"],
  };
}
```

Add the necessary import: `import type { PSOrder } from "@/lib/prestashop/types";` (add to existing import line).

- [ ] **Step 2: Add syncSingleOrder to SyncEngine**

Add to `SyncEngine` class in `src/lib/sync/engine.ts`:

```typescript
async syncSingleOrder(psId: number, jobId: string): Promise<SyncResult> {
  try {
    const psOrder = await this.ps.get<PSOrder>("orders", psId);

    // Check existing mapping
    const existing = await (this.prisma as any).idMapping.findUnique({
      where: { resourceType_psId: { resourceType: "order", psId } },
    });
    if (existing?.shopifyGid) {
      await this.log(jobId, "order", psId, "skip");
      return { psId, action: "skip", shopifyGid: existing.shopifyGid };
    }

    // Auto-resolve customer
    const customerId = parseInt(psOrder.id_customer);
    const customerResult = await this.syncSingleCustomer(customerId, jobId);
    if (!customerResult.shopifyGid) {
      throw new Error(`Failed to resolve customer PS#${customerId}`);
    }

    // Auto-resolve products from order rows
    const orderRows = psOrder.associations?.order_rows ?? [];
    const lineItems: { variantId: string; quantity: number }[] = [];

    for (const row of orderRows) {
      const productPsId = parseInt(row.product_id);
      const productResult = await this.syncSingleProduct(productPsId, jobId);
      if (!productResult.shopifyGid) {
        throw new Error(`Failed to resolve product PS#${productPsId}`);
      }

      // Get the first variant GID from the product
      // productResult.shopifyGid is the product GID; we need to fetch the variant
      const variantGid = await this.getFirstVariantGid(productResult.shopifyGid);

      lineItems.push({
        variantId: variantGid,
        quantity: parseInt(row.product_quantity),
      });
    }

    // Resolve addresses
    let shippingAddress: Record<string, string> | undefined;
    try {
      const addresses = await this.ps.list<PSAddress>("addresses", {
        display: "full",
        filter: { id_customer: psOrder.id_customer },
      });
      if (addresses.length > 0) {
        const addr = addresses[0];
        shippingAddress = {
          firstName: addr.firstname,
          lastName: addr.lastname,
          address1: addr.address1,
          address2: addr.address2 || "",
          city: addr.city,
          zip: addr.postcode,
          countryCode: "CA",
          phone: addr.phone || addr.phone_mobile || "",
        };
      }
    } catch {
      // Addresses not critical — continue without
    }

    const transformed = transformOrder(
      psOrder,
      customerResult.shopifyGid,
      lineItems,
      shippingAddress,
      shippingAddress // billing = shipping for now
    );

    const created = await this.shopify.createOrder(transformed);
    const shopifyGid = created.id;

    await (this.prisma as any).idMapping.upsert({
      where: { resourceType_psId: { resourceType: "order", psId } },
      create: { resourceType: "order", psId, shopifyGid, dataHash: "", syncStatus: "synced" },
      update: { shopifyGid, lastSyncedAt: new Date(), syncStatus: "synced" },
    });

    await this.log(jobId, "order", psId, "create");
    return { psId, action: "create", shopifyGid };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await this.log(jobId, "order", psId, "error", { error: message });
    return { psId, action: "error", error: message };
  }
}

private async getFirstVariantGid(productGid: string): Promise<string> {
  const { data } = await (this.shopify as any).graphql.request(
    `query getVariant($id: ID!) {
      product(id: $id) {
        variants(first: 1) { edges { node { id } } }
      }
    }`,
    { variables: { id: productGid } }
  );
  const product = data.product as { variants: { edges: { node: { id: string } }[] } };
  if (!product.variants.edges.length) throw new Error(`No variants for product ${productGid}`);
  return product.variants.edges[0].node.id;
}
```

Add import for `PSAddress` and `PSOrder` at the top of engine.ts:
```typescript
import type { PSProduct, PSCustomer, PSOrder, PSAddress } from "@/lib/prestashop/types";
```

Add import for `transformOrder` in engine.ts:
```typescript
import { transformProduct, transformCustomer, transformOrder } from "./transform";
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/sync/engine.ts src/lib/sync/transform.ts
git commit -m "feat: order sync with auto-resolution of customers and products"
```

---

### Task 9: Sync API Route — Replace Inngest with Self-Chaining

**Files:**
- Modify: `src/app/api/sync/route.ts`

- [ ] **Step 1: Rewrite sync route without Inngest**

Replace `src/app/api/sync/route.ts` entirely:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import { getSessionForShop } from "@/lib/shopify/auth";
import { shopify } from "@/lib/shopify/auth";
import { ShopifyClient } from "@/lib/shopify/client";
import { SyncEngine } from "@/lib/sync/engine";
import { prisma } from "@/lib/db";
import type { PSProduct, PSCustomer, PSOrder } from "@/lib/prestashop/types";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const searchParams = request.nextUrl.searchParams;

  // Support both JSON body (UI) and query params (self-chaining)
  const resourceType = body?.resourceType ?? searchParams.get("resourceType");
  const psIds: number[] | null = body?.psIds ?? null;
  const batchSize = parseInt(body?.batchSize ?? searchParams.get("batchSize") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const jobId = searchParams.get("jobId") ?? `sync-${resourceType}-${Date.now()}`;

  if (!resourceType) {
    return NextResponse.json({ error: "resourceType is required" }, { status: 400 });
  }

  try {
    // Get Shopify session
    const session = await prisma.session.findFirst({
      where: { accessToken: { not: null } },
    });
    if (!session?.accessToken) {
      return NextResponse.json({ error: "No Shopify session found" }, { status: 401 });
    }

    const graphqlClient = new shopify.clients.Graphql({ session: session as any });
    const shopifyClient = new ShopifyClient(graphqlClient);
    const ps = getPSConnector();
    const engine = new SyncEngine(ps, shopifyClient, prisma);

    // Individual sync (specific IDs)
    if (psIds && psIds.length > 0) {
      const results = [];
      for (const id of psIds) {
        if (resourceType === "products") results.push(await engine.syncSingleProduct(id, jobId));
        else if (resourceType === "customers") results.push(await engine.syncSingleCustomer(id, jobId));
        else if (resourceType === "orders") results.push(await engine.syncSingleOrder(id, jobId));
      }
      return NextResponse.json({ jobId, status: "completed", results });
    }

    // Batch sync
    const resourceMap: Record<string, string> = { products: "products", customers: "customers", orders: "orders" };
    const psResource = resourceMap[resourceType];
    if (!psResource) {
      return NextResponse.json({ error: `Unknown resourceType: ${resourceType}` }, { status: 400 });
    }

    // For orders, only sync completed ones (current_state = 5)
    const filters: Record<string, unknown> = { limit: batchSize, offset };
    if (resourceType === "orders") {
      (filters as any).filter = { current_state: "5" };
    }

    const items = await ps.list<PSProduct | PSCustomer | PSOrder>(psResource as any, filters as any);

    const results = [];
    for (const item of items) {
      const id = (item as any).id;
      if (resourceType === "products") results.push(await engine.syncSingleProduct(id, jobId));
      else if (resourceType === "customers") results.push(await engine.syncSingleCustomer(id, jobId));
      else if (resourceType === "orders") results.push(await engine.syncSingleOrder(id, jobId));
    }

    if (items.length < batchSize) {
      // Last batch
      return NextResponse.json({ jobId, status: "completed", batch: { offset, results } });
    }

    // More batches — self-chain
    const nextOffset = offset + batchSize;
    const baseUrl = request.nextUrl.origin;
    const nextUrl = `${baseUrl}/api/sync?offset=${nextOffset}&jobId=${encodeURIComponent(jobId)}&resourceType=${resourceType}&batchSize=${batchSize}`;

    after(async () => {
      try { await fetch(nextUrl, { method: "POST" }); } catch { /* next cron picks up */ }
    });

    return NextResponse.json({
      jobId,
      status: "in_progress",
      batch: { offset, count: results.length },
      nextOffset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/sync/route.ts
git commit -m "feat: replace Inngest sync with self-chaining batches"
```

---

### Task 10: Sync Launcher UI — 3 Tabs with Orders

**Files:**
- Modify: `src/components/sync/sync-launcher.tsx`

- [ ] **Step 1: Rewrite sync launcher with orders support**

Replace `src/components/sync/sync-launcher.tsx`:

- Add "orders" to the SelectContent options
- Remove the `shop` prop (session resolved server-side now)
- Add a note below the orders option about auto-resolution
- Keep the PS IDs field and batch size

Add `orders` option:
```typescript
<SelectItem value="orders">Commandes (terminées)</SelectItem>
```

When `resourceType === "orders"`, show a small note:
```typescript
{resourceType === "orders" && (
  <p className="text-xs text-muted-foreground">
    Les clients et produits manquants seront créés automatiquement.
  </p>
)}
```

Remove `shop` from the POST body since it's no longer needed.

- [ ] **Step 2: Update sync page if it passes shop prop**

Check `src/app/(dashboard)/sync/page.tsx` — if it passes a `shop` prop to `SyncLauncher`, remove it.

- [ ] **Step 3: Commit**

```bash
git add src/components/sync/sync-launcher.tsx src/app/\(dashboard\)/sync/page.tsx
git commit -m "feat: sync launcher supports orders with auto-resolution note"
```

---

### Task 11: Cleanup Inngest

**Files:**
- Delete: `src/lib/inngest/client.ts`
- Delete: `src/lib/inngest/functions.ts`
- Delete: `src/app/api/inngest/route.ts`
- Modify: `package.json` — remove inngest dependency

- [ ] **Step 1: Delete Inngest files**

```bash
rm src/lib/inngest/client.ts src/lib/inngest/functions.ts src/app/api/inngest/route.ts
rmdir src/lib/inngest src/app/api/inngest
```

- [ ] **Step 2: Remove inngest from package.json**

```bash
npm uninstall inngest
```

- [ ] **Step 3: Verify build still works**

```bash
npm run build
```

If there are remaining imports of inngest anywhere, remove them.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Inngest — replaced by self-chaining sync"
```

---

### Task 12: Deploy + Linear + Verify

**Files:** None (deployment + tracking)

- [ ] **Step 1: Deploy to Vercel production**

```bash
npx vercel --prod
```

- [ ] **Step 2: Create Linear issues**

Create 4 Linear issues in project "CANADA - Shopify Savons" (all Done):
1. "feat: Détail client — panel latéral avec adresses et commandes"
2. "feat: Détail commande — panel latéral avec lignes et totaux"
3. "feat: Déduplication produits par SKU/titre + clients par email"
4. "feat: Import commandes terminées PS → Shopify avec auto-résolution"

- [ ] **Step 3: Verify all features in production**

Test each feature:
1. Click a customer → detail panel shows with addresses + orders
2. Click an order → detail panel shows with line items + totals
3. Sync a single product (PS ID) → verify no duplicate created in Shopify
4. Sync a single order → verify customer + products auto-resolved

- [ ] **Step 4: Push all commits**

```bash
git push origin main
```
