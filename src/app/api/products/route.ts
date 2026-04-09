import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSProduct, PSCategory } from "@/lib/prestashop/types";

const FR_LANG_ID = "1";

function getLangValue(values: { id: string; value: string }[], langId: string): string {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

// Cache categories in memory (they rarely change)
let categoryCache: Record<string, string> | null = null;
let categoryCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getCategoryLookup(ps: ReturnType<typeof getPSConnector>): Promise<Record<string, string>> {
  if (categoryCache && Date.now() - categoryCacheTime < CACHE_TTL) {
    return categoryCache;
  }
  const rawCategories = await ps.list<PSCategory>("categories", { display: "full" });
  const lookup: Record<string, string> = {};
  for (const cat of rawCategories) {
    lookup[String(cat.id)] = getLangValue(cat.name, FR_LANG_ID);
  }
  categoryCache = lookup;
  categoryCacheTime = Date.now();
  return lookup;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") ?? "25");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "all";

  try {
    const ps = getPSConnector();

    // Build PS API filters for server-side filtering
    const filters: Record<string, unknown> = {
      display: "full",
      limit,
      offset,
    };

    // Push filters to PS API where possible
    const psFilter: Record<string, string> = {};
    if (search) psFilter.name = `%[${search}]%`;
    if (status === "active") psFilter.active = "1";
    if (status === "inactive") psFilter.active = "0";
    if (Object.keys(psFilter).length > 0) (filters as any).filter = psFilter;

    const [rawProducts, catLookup] = await Promise.all([
      ps.list<PSProduct>("products", filters as any),
      getCategoryLookup(ps),
    ]);

    const products = rawProducts.map((p) => {
      const catIds = p.associations?.categories ?? [];
      const categoryTags: string[] = [];
      for (const catRef of catIds) {
        const name = catLookup[catRef.id];
        if (name && name !== "Root" && name !== "Racine" && name !== "Home" && name !== "Accueil") {
          categoryTags.push(name);
        }
      }

      const imageIds = (p.associations?.images ?? []).map((img) => parseInt(img.id));
      const imageDefault = p.id_default_image && p.id_default_image !== "0"
        ? parseInt(p.id_default_image)
        : null;

      return {
        psId: p.id,
        reference: p.reference || null,
        ean13: p.ean13 || null,
        active: p.active === "1",
        nameFr: getLangValue(p.name, FR_LANG_ID) || null,
        descriptionShortFr: getLangValue(p.description_short, FR_LANG_ID) || null,
        priceHT: parseFloat(p.price),
        stockAvailable: 0,
        categoryDefault: catLookup[p.id_category_default] || null,
        categoryTags,
        imageDefault,
        imageIds,
      };
    });

    return NextResponse.json({
      data: products,
      total: products.length,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
