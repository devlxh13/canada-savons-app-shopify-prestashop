import { NextRequest, NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import { prisma } from "@/lib/db";
import type { PSCategory } from "@/lib/prestashop/types";
import { requireAuth } from "@/lib/auth";

function getLangValue(values: { id: string; value: string }[], langId: string): string {
  return values?.find((v) => v.id === langId)?.value ?? "";
}

/**
 * One-shot endpoint: map English category names → French in local DB.
 * Only fetches categories from PrestaShop (fast), then rewrites local DB.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  try {
    const ps = getPSConnector();

    // 1. Build EN→FR mapping from PrestaShop categories
    const categories = await ps.list<PSCategory>("categories", { display: "full" });
    const enToFr: Record<string, string> = {};
    for (const cat of categories) {
      const en = getLangValue(cat.name, "2");
      const fr = getLangValue(cat.name, "1");
      if (en && fr) enToFr[en] = fr;
    }

    // 2. Read all products from local DB and fix category names
    const products = await (prisma as any).product.findMany({
      select: { id: true, categoryTags: true, categoryDefault: true },
    });

    let updated = 0;
    for (const product of products) {
      const newTags = (product.categoryTags as string[]).map(
        (tag: string) => enToFr[tag] ?? tag
      );
      const newDefault = product.categoryDefault
        ? enToFr[product.categoryDefault] ?? product.categoryDefault
        : null;

      const tagsChanged = JSON.stringify(newTags) !== JSON.stringify(product.categoryTags);
      const defaultChanged = newDefault !== product.categoryDefault;

      if (tagsChanged || defaultChanged) {
        await (prisma as any).product.update({
          where: { id: product.id },
          data: { categoryTags: newTags, categoryDefault: newDefault },
        });
        updated++;
      }
    }

    return NextResponse.json({ status: "done", updated, mappings: Object.keys(enToFr).length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
