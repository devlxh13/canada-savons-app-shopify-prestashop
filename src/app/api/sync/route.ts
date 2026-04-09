import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import { shopify } from "@/lib/shopify/auth";
import { ShopifyClient } from "@/lib/shopify/client";
import { SyncEngine } from "@/lib/sync/engine";
import { prisma } from "@/lib/db";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const searchParams = request.nextUrl.searchParams;

  const resourceType = body?.resourceType ?? searchParams.get("resourceType");
  const psIds: number[] | null = body?.psIds ?? null;
  const batchSize = parseInt(body?.batchSize ?? searchParams.get("batchSize") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const jobId = searchParams.get("jobId") ?? `sync-${resourceType}-${Date.now()}`;

  if (!resourceType) {
    return NextResponse.json({ error: "resourceType is required" }, { status: 400 });
  }

  try {
    const session = await prisma.session.findFirst({
      where: { accessToken: { not: null } },
    });
    if (!session?.accessToken) {
      return NextResponse.json({ error: "No Shopify session found" }, { status: 401 });
    }

    const graphqlClient = new shopify.clients.Graphql({ session: session as any });
    const shopifyClient = new ShopifyClient(graphqlClient);
    const ps = getPSConnector();
    const engine = new SyncEngine(ps, shopifyClient, prisma);

    // Individual sync
    if (psIds && psIds.length > 0) {
      const results = [];
      for (const id of psIds) {
        if (resourceType === "products") results.push(await engine.syncSingleProduct(id, jobId));
        else if (resourceType === "customers") results.push(await engine.syncSingleCustomer(id, jobId));
        else if (resourceType === "orders") results.push(await engine.syncSingleOrder(id, jobId));
      }
      return NextResponse.json({ jobId, status: "completed", results });
    }

    // Batch sync
    const filters: Record<string, unknown> = { limit: batchSize, offset };
    if (resourceType === "orders") {
      (filters as any).filter = { current_state: "5" };
    }

    const items = await ps.list<{ id: number }>(resourceType as any, filters as any);

    const results = [];
    for (const item of items) {
      if (resourceType === "products") results.push(await engine.syncSingleProduct(item.id, jobId));
      else if (resourceType === "customers") results.push(await engine.syncSingleCustomer(item.id, jobId));
      else if (resourceType === "orders") results.push(await engine.syncSingleOrder(item.id, jobId));
    }

    if (items.length < batchSize) {
      return NextResponse.json({ jobId, status: "completed", batch: { offset, results } });
    }

    // Self-chain next batch
    const nextOffset = offset + batchSize;
    const baseUrl = request.nextUrl.origin;
    const nextUrl = `${baseUrl}/api/sync?offset=${nextOffset}&jobId=${encodeURIComponent(jobId)}&resourceType=${resourceType}&batchSize=${batchSize}`;

    after(async () => {
      try { await fetch(nextUrl, { method: "POST" }); } catch { /* next cron picks up */ }
    });

    return NextResponse.json({ jobId, status: "in_progress", batch: { offset, count: results.length }, nextOffset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
