import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import type { PSProduct, PSCategory } from "@/lib/prestashop/types";

const FR_LANG_ID = "1";

function getLangValue(values: { id: string; value: string }[], langId: string): string {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

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

    const [product, rawCategories, stocks] = await Promise.all([
      ps.get<PSProduct>("products", psId),
      ps.list<PSCategory>("categories", { display: "full" }),
      ps.list<{ id_product: string; quantity: string }>(
        "stock_availables",
        { display: "full", filter: { id_product: String(psId) } }
      ),
    ]);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const catLookup: Record<string, string> = {};
    for (const cat of rawCategories) {
      catLookup[String(cat.id)] = getLangValue(cat.name, FR_LANG_ID);
    }

    const catIds = product.associations?.categories ?? [];
    const categoryTags: string[] = [];
    for (const catRef of catIds) {
      const name = catLookup[catRef.id];
      if (name && name !== "Root" && name !== "Racine" && name !== "Home" && name !== "Accueil") {
        categoryTags.push(name);
      }
    }

    const imageIds = (product.associations?.images ?? []).map((img) => parseInt(img.id));
    const imageDefault = product.id_default_image && product.id_default_image !== "0"
      ? parseInt(product.id_default_image)
      : null;

    return NextResponse.json({
      psId: product.id,
      reference: product.reference || null,
      ean13: product.ean13 || null,
      weight: product.weight ? parseFloat(product.weight) : null,
      active: product.active === "1",
      nameFr: getLangValue(product.name, FR_LANG_ID) || null,
      descriptionFr: getLangValue(product.description, FR_LANG_ID) || null,
      descriptionShortFr: getLangValue(product.description_short, FR_LANG_ID) || null,
      priceHT: parseFloat(product.price),
      stockAvailable: stocks.reduce((sum, s) => sum + parseInt(s.quantity || "0"), 0),
      categoryDefault: catLookup[product.id_category_default] || null,
      categoryTags,
      imageDefault,
      imageIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
