import type { PSConnector } from "@/lib/prestashop/connector";
import type { ShopifyClient } from "@/lib/shopify/client";
import type { PrismaClient } from "@prisma/client";
import type { PSProduct, PSCustomer, PSOrder, PSAddress } from "@/lib/prestashop/types";
import type { SyncResult } from "./types";
import { transformProduct, transformCustomer, transformOrder, type PsOrderLineItem } from "./transform";
import { contentHash } from "./hash";
import { withImmediateRetry, computeDeferredNextRetry } from "./retry";

export class SyncEngine {
  constructor(
    private ps: PSConnector,
    private shopify: ShopifyClient,
    private prisma: PrismaClient
  ) {}

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
          return { psId, action: "skip", shopifyGid: existing.shopifyGid };
        }

        let shopifyGid: string;
        let action: "create" | "update";

        if (existing?.shopifyGid) {
          const updated = await this.shopify.updateProduct(existing.shopifyGid, transformed.product, transformed.variant);
          shopifyGid = updated.id;
          action = "update";
        } else {
          // Dedup: search Shopify for existing product by SKU then title
          const existingGid = await this.shopify.findExistingProduct(
            transformed.sku,
            transformed.product.title
          );

          if (existingGid) {
            // Found in Shopify but no local mapping — reconcile
            const updated = await this.shopify.updateProduct(existingGid, transformed.product, transformed.variant);
            shopifyGid = updated.id;
            action = "update";
          } else {
            const created = await this.shopify.createProduct(transformed.product, transformed.variant);
            shopifyGid = created.id;
            action = "create";
          }
        }

        // Sync inventory from PrestaShop
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

  async syncSingleCustomer(psId: number, jobId: string): Promise<SyncResult> {
    try {
      return await withImmediateRetry(async () => {
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
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await this.log(jobId, "customer", psId, "error", { error: message });
      await this.enqueueRetry(jobId, "customer", psId, message);
      return { psId, action: "error", error: message };
    }
  }

  async syncSingleOrder(psId: number, jobId: string): Promise<SyncResult> {
    try {
      const psOrder = await this.ps.get<PSOrder>("orders", psId);

      // Check existing mapping — orders are never updated, only created once
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

      // Auto-resolve products from order rows. If a row's PS product is
      // missing, deleted, or fails its own product sync, fall back to a
      // custom (variant-less) line item carrying the historical PS title,
      // sku, and unit price — keeps the order importable instead of throwing.
      const orderRows = psOrder.associations?.order_rows ?? [];
      const lineItems: PsOrderLineItem[] = [];

      for (const row of orderRows) {
        const productPsId = parseInt(row.product_id);
        const baseLine: PsOrderLineItem = {
          quantity: parseInt(row.product_quantity),
          unitPriceTaxIncl: row.unit_price_tax_incl,
          title: row.product_name,
          sku: (row as { product_reference?: string }).product_reference,
        };
        try {
          const productResult = await this.syncSingleProduct(productPsId, jobId);
          if (productResult.shopifyGid) {
            const variantGid = await this.getFirstVariantGid(productResult.shopifyGid);
            lineItems.push({ ...baseLine, variantId: variantGid });
            continue;
          }
        } catch {
          // fall through to custom line item
        }
        lineItems.push(baseLine);
      }

      // Resolve shipping + billing addresses. The order points at specific
      // address ids (id_address_delivery / id_address_invoice). Fall back to
      // the customer's first address if those ids are missing or unfetchable.
      const toShopifyAddress = (addr: PSAddress): Record<string, string> => ({
        firstName: addr.firstname,
        lastName: addr.lastname,
        address1: addr.address1,
        address2: addr.address2 || "",
        city: addr.city,
        zip: addr.postcode,
        countryCode: "CA",
        phone: addr.phone || addr.phone_mobile || "",
      });

      const fetchAddress = async (id?: string) => {
        if (!id) return undefined;
        try {
          const a = await this.ps.get<PSAddress>("addresses", parseInt(id));
          return toShopifyAddress(a);
        } catch {
          return undefined;
        }
      };

      let shippingAddress = await fetchAddress(psOrder.id_address_delivery);
      let billingAddress = await fetchAddress(psOrder.id_address_invoice);

      // Fallback: customer's first address if neither resolved
      if (!shippingAddress && !billingAddress) {
        try {
          const addresses = await this.ps.list<PSAddress>("addresses", {
            display: "full",
            filter: { id_customer: psOrder.id_customer },
          });
          if (addresses.length > 0) {
            const fallback = toShopifyAddress(addresses[0]);
            shippingAddress = fallback;
            billingAddress = fallback;
          }
        } catch {
          // Addresses not critical — continue without
        }
      }
      // If only one of the two resolved, mirror it
      if (shippingAddress && !billingAddress) billingAddress = shippingAddress;
      if (billingAddress && !shippingAddress) shippingAddress = billingAddress;

      let fulfilledStateIds: Set<string> | undefined;
      try {
        fulfilledStateIds = await this.ps.getFulfilledStateIds();
      } catch {
        // PS DB unreachable (typical from envs outside the OVH network) —
        // fall back to the hardcoded default in transformOrder.
        fulfilledStateIds = undefined;
      }

      const transformed = transformOrder(
        psOrder,
        customerResult.shopifyGid,
        lineItems,
        shippingAddress,
        billingAddress,
        fulfilledStateIds
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
      await this.enqueueRetry(jobId, "order", psId, message);
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

  private async log(jobId: string, resourceType: string, psId: number, action: string, details?: Record<string, unknown>) {
    await (this.prisma as any).syncLog.create({
      data: { jobId, resourceType, psId, action, details: details ?? null },
    });
  }
}
