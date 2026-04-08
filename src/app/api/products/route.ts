import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSProduct, PSCategory } from "@/lib/prestashop/types";

const FR_LANG_ID = "1";

function getLangValue(values: { id: string; value: string }[], langId: string): string {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") ?? "25");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const stock = searchParams.get("stock") ?? "all";
  const image = searchParams.get("image") ?? "all";

  try {
    const ps = getPSConnector();

    // Fetch products and categories from PrestaShop API
    const [rawProducts, rawCategories] = await Promise.all([
      ps.list<PSProduct>("products", { display: "full" }),
      ps.list<PSCategory>("categories", { display: "full" }),
    ]);

    // Build category lookup (FR)
    const catLookup: Record<string, string> = {};
    for (const cat of rawCategories) {
      catLookup[String(cat.id)] = getLangValue(cat.name, FR_LANG_ID);
    }

    // Transform to FR-only flat objects
    let products = rawProducts.map((p) => {
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
        stockAvailable: 0, // stock not fetched here for speed
        categoryDefault: catLookup[p.id_category_default] || null,
        categoryTags,
        imageDefault,
        imageIds,
      };
    });

    // Apply filters
    if (search) {
      const q = search.toLowerCase();
      products = products.filter(
        (p) =>
          p.nameFr?.toLowerCase().includes(q) ||
          p.reference?.toLowerCase().includes(q)
      );
    }
    if (status === "active") products = products.filter((p) => p.active);
    if (status === "inactive") products = products.filter((p) => !p.active);
    if (category !== "all") products = products.filter((p) => p.categoryTags.includes(category));
    if (image === "with") products = products.filter((p) => p.imageDefault !== null);
    if (image === "without") products = products.filter((p) => p.imageDefault === null);

    const total = products.length;
    const paginated = products.slice(offset, offset + limit);

    return NextResponse.json({
      data: paginated,
      total,
      limit,
      offset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
