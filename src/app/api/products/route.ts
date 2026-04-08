import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") ?? "25");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "all";
  const category = searchParams.get("category") ?? "all";
  const stock = searchParams.get("stock") ?? "all";
  const sync = searchParams.get("sync") ?? "all";

  try {
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { nameEn: { contains: search, mode: "insensitive" } },
        { nameFr: { contains: search, mode: "insensitive" } },
        { reference: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status === "active") where.active = true;
    if (status === "inactive") where.active = false;

    if (category !== "all") where.categoryTags = { has: category };

    if (stock === "in_stock") where.stockAvailable = { gt: 0 };
    if (stock === "out_of_stock") where.stockAvailable = { equals: 0 };

    const [products, total] = await Promise.all([
      (prisma as any).product.findMany({
        where,
        orderBy: { psId: "asc" },
        skip: offset,
        take: limit,
      }),
      (prisma as any).product.count({ where }),
    ]);

    const psIds = products.map((p: { psId: number }) => p.psId);
    const mappings = await (prisma as any).idMapping.findMany({
      where: { resourceType: "product", psId: { in: psIds } },
    });
    const syncMap = new Map(
      mappings.map((m: { psId: number; shopifyGid: string; syncStatus: string; lastSyncedAt: Date }) => [
        m.psId,
        { shopifyGid: m.shopifyGid, syncStatus: m.syncStatus, lastSyncedAt: m.lastSyncedAt },
      ])
    );

    const enriched = products.map((p: Record<string, unknown>) => ({
      ...p,
      priceHT: Number(p.priceHT),
      weight: p.weight ? Number(p.weight) : null,
      sync: syncMap.get(p.psId as number) ?? null,
    }));

    let filtered = enriched;
    if (sync === "synced") filtered = enriched.filter((p: Record<string, unknown>) => p.sync !== null);
    if (sync === "not_synced") filtered = enriched.filter((p: Record<string, unknown>) => p.sync === null);
    if (sync === "error") filtered = enriched.filter((p: Record<string, unknown>) => (p.sync as Record<string, unknown> | null)?.syncStatus === "error");

    const lastSync = await (prisma as any).syncLog.findFirst({
      where: { resourceType: "local_product", action: "sync_complete" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    return NextResponse.json({
      data: filtered,
      total,
      limit,
      offset,
      lastSyncedAt: lastSync?.createdAt ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
