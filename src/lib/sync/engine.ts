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
