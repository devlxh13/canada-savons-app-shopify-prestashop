import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const psId = parseInt(id);

  if (isNaN(psId)) {
    return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
  }

  try {
    const product = await (prisma as any).product.findUnique({
      where: { psId },
    });

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const mapping = await (prisma as any).idMapping.findUnique({
      where: { resourceType_psId: { resourceType: "product", psId } },
    });

    return NextResponse.json({
      ...product,
      priceHT: Number(product.priceHT),
      weight: product.weight ? Number(product.weight) : null,
      sync: mapping
        ? { shopifyGid: mapping.shopifyGid, syncStatus: mapping.syncStatus, lastSyncedAt: mapping.lastSyncedAt }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
