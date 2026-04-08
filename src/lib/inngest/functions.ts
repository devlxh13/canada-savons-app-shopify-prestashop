import { inngest } from "./client";
import { SyncEngine } from "@/lib/sync/engine";
import { getPSConnector } from "@/lib/prestashop/registry";
import { ShopifyClient } from "@/lib/shopify/client";
import { getSessionForShop } from "@/lib/shopify/auth";
import { shopify } from "@/lib/shopify/auth";
import { prisma } from "@/lib/db";
import type { SyncJobConfig, SyncResult } from "@/lib/sync/types";
import { buildCategoryLookup, syncProductBatch, deleteStaleProducts, logSyncComplete } from "@/lib/sync/local-sync";

async function createSyncEngine(shop: string): Promise<SyncEngine> {
  const session = await getSessionForShop(shop);
  if (!session?.accessToken) throw new Error(`No session for shop: ${shop}`);

  const graphqlClient = new shopify.clients.Graphql({ session: session as any });
  const shopifyClient = new ShopifyClient(graphqlClient as any);
  const psConnector = getPSConnector();

  return new SyncEngine(psConnector, shopifyClient, prisma);
}

export const syncProducts = inngest.createFunction(
  {
    id: "sync-products",
    retries: 1,
    triggers: [{ event: "sync/products" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
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
  {
    id: "sync-customers",
    retries: 1,
    triggers: [{ event: "sync/customers" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
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
  {
    id: "sync-single",
    retries: 2,
    triggers: [{ event: "sync/single" }],
  },
  async ({ event }: { event: any }) => {
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

export const syncLocalProducts = inngest.createFunction(
  {
    id: "sync-local-products",
    retries: 1,
    triggers: [{ cron: "*/15 * * * *" }, { event: "sync/local-products" }],
  },
  async ({ step }: { step: any }) => {
    const jobId = `local-sync-${Date.now()}`;
    const batchSize = 50;

    // Step 1: Build category lookup
    const categoryLookup = await step.run("build-category-lookup", async () => {
      const ps = getPSConnector();
      return buildCategoryLookup(ps);
    });

    // Step 2+: Process batches until no more products
    const allPsIds: number[] = [];
    let totals = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batchResult = await step.run(`sync-batch-${offset}`, async () => {
        const ps = getPSConnector();
        return syncProductBatch(ps, prisma, jobId, categoryLookup, offset, batchSize);
      });

      allPsIds.push(...batchResult.psIds);
      totals.total += batchResult.total;
      totals.created += batchResult.created;
      totals.updated += batchResult.updated;
      totals.skipped += batchResult.skipped;
      totals.errors += batchResult.errors;

      if (batchResult.total < batchSize) {
        hasMore = false;
      }
      offset += batchSize;
    }

    // Final step: delete stale products and log
    const deleted = await step.run("cleanup-stale-products", async () => {
      return deleteStaleProducts(prisma, allPsIds);
    });

    await step.run("log-sync-complete", async () => {
      return logSyncComplete(prisma, jobId, { ...totals, deleted });
    });

    return { ...totals, deleted };
  }
);

export const inngestFunctions = [syncProducts, syncCustomers, syncSingle, syncLocalProducts];
