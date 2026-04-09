import type { PSConnector } from "@/lib/prestashop/connector";
import type { ShopifyClient } from "@/lib/shopify/client";
import type { PrismaClient } from "@prisma/client";
import type { PSProduct, PSCustomer, PSOrder, PSAddress } from "@/lib/prestashop/types";
import type { SyncResult } from "./types";
import { transformProduct, transformCustomer, transformOrder } from "./transform";
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

      // Auto-resolve products from order rows and get variant GIDs
      const orderRows = psOrder.associations?.order_rows ?? [];
      const lineItems: { variantId: string; quantity: number }[] = [];

      for (const row of orderRows) {
        const productPsId = parseInt(row.product_id);
        const productResult = await this.syncSingleProduct(productPsId, jobId);
        if (!productResult.shopifyGid) {
          throw new Error(`Failed to resolve product PS#${productPsId}`);
        }
        const variantGid = await this.getFirstVariantGid(productResult.shopifyGid);
        lineItems.push({
          variantId: variantGid,
          quantity: parseInt(row.product_quantity),
        });
      }

      // Resolve shipping address
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
        shippingAddress
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

  private async log(jobId: string, resourceType: string, psId: number, action: string, details?: Record<string, unknown>) {
    await (this.prisma as any).syncLog.create({
      data: { jobId, resourceType, psId, action, details: details ?? null },
    });
  }
}
