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

async function getProductStock(ps: PSConnector, stockAvailableIds: { id: string; id_product_attribute: string }[]): Promise<number> {
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

  const categoryLookup = await buildCategoryLookup(ps);

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
        const stockAvailables = product.associations?.stock_availables ?? [];
        const stockAvailable = await getProductStock(ps, stockAvailables);

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

  if (seenPsIds.length > 0) {
    const deleteResult = await (prisma as any).product.deleteMany({
      where: { psId: { notIn: seenPsIds } },
    });
    result.deleted = deleteResult.count;
  }

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
