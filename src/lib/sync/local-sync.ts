import type { PSProduct, PSCategory } from "@/lib/prestashop/types";
import type { PSConnector } from "@/lib/prestashop/connector";
import type { PrismaClient } from "@prisma/client";
import { contentHash } from "./hash";

interface CategoryLookup {
  [id: string]: string; // id -> name (FR)
}

interface StockLookup {
  [productId: string]: number;
}

function getLangValue(values: { id: string; value: string }[], langId: string): string {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

export async function buildCategoryLookup(ps: PSConnector): Promise<CategoryLookup> {
  const categories = await ps.list<PSCategory>("categories", { display: "full" });
  const lookup: CategoryLookup = {};
  for (const cat of categories) {
    const name = getLangValue(cat.name, "1"); // FR only
    lookup[String(cat.id)] = name;
  }
  return lookup;
}

export async function buildStockLookup(ps: PSConnector): Promise<StockLookup> {
  const lookup: StockLookup = {};
  // Fetch stock_availables via API in batches
  let offset = 0;
  const batchSize = 500;
  let hasMore = true;

  while (hasMore) {
    try {
      const stocks = await ps.list<{ id: number; id_product: string; id_product_attribute: string; quantity: string }>(
        "stock_availables",
        { limit: batchSize, offset }
      );
      for (const s of stocks) {
        const pid = String(s.id_product);
        lookup[pid] = (lookup[pid] ?? 0) + parseInt(s.quantity || "0");
      }
      if (stocks.length < batchSize) hasMore = false;
      offset += batchSize;
    } catch {
      // API failed for stock — return empty lookup, stock will be 0
      break;
    }
  }

  return lookup;
}

export interface BatchSyncResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  psIds: number[];
}

/** Sync a single batch of products (fetched by offset) into the local DB. */
export async function syncProductBatch(
  ps: PSConnector,
  prisma: PrismaClient,
  jobId: string,
  categoryLookup: CategoryLookup,
  stockLookup: StockLookup,
  offset: number,
  batchSize: number
): Promise<BatchSyncResult> {
  const result: BatchSyncResult = { total: 0, created: 0, updated: 0, skipped: 0, errors: 0, psIds: [] };

  const products = await ps.list<PSProduct>("products", {
    limit: batchSize,
    offset,
    display: "full",
  });

  for (const product of products) {
    result.total++;
    result.psIds.push(product.id);

    try {
      const stockAvailable = stockLookup[String(product.id)] ?? 0;

      const catIds = product.associations?.categories ?? [];
      const categoryTags: string[] = [];
      for (const catRef of catIds) {
        const name = categoryLookup[catRef.id];
        if (name && name !== "Root" && name !== "Racine" && name !== "Home" && name !== "Accueil") {
          categoryTags.push(name);
        }
      }

      const defaultCat = categoryLookup[product.id_category_default] || null;

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
        descriptionFr: getLangValue(product.description, "1") || null,
        descriptionShortFr: getLangValue(product.description_short, "1") || null,
        priceHT: parseFloat(product.price),
        taxRuleGroupId: product.id_tax_rules_group ? parseInt(String(product.id_tax_rules_group)) : null,
        stockAvailable,
        categoryDefault: defaultCat,
        categoryTags,
        imageDefault,
        imageIds,
      };

      const hash = contentHash(productData);

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

  return result;
}

/** Clean up local products whose psId was not seen during sync. */
export async function deleteStaleProducts(
  prisma: PrismaClient,
  seenPsIds: number[]
): Promise<number> {
  if (seenPsIds.length === 0) return 0;
  const deleteResult = await (prisma as any).product.deleteMany({
    where: { psId: { notIn: seenPsIds } },
  });
  return deleteResult.count;
}

/** Log sync completion. */
export async function logSyncComplete(
  prisma: PrismaClient,
  jobId: string,
  details: Record<string, unknown>
): Promise<void> {
  await (prisma as any).syncLog.create({
    data: {
      jobId,
      resourceType: "local_product",
      action: "sync_complete",
      details,
    },
  });
}
