import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import { shopify } from "@/lib/shopify/auth";
import { ShopifyClient } from "@/lib/shopify/client";
import { SyncEngine } from "@/lib/sync/engine";
import { recordSyncStats } from "@/lib/sync/stats";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
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

  const startTime = Date.now();

  try {
    const session = await prisma.session.findFirst({
      where: { accessToken: { not: null } },
    });
    if (!session?.accessToken) {
      return NextResponse.json({ error: "No Shopify session found" }, { status: 401 });
    }

    const graphqlClient = new shopify.clients.Graphql({ session: session as any });
    const shopifyClient = new ShopifyClient(graphqlClient as any);
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
      // PS_ORDER_SYNC_STATES is a comma-separated list of PS current_state IDs
      // to import. Defaults to '4,5' (Shipped + Delivered) so the auto-sync
      // covers more than just delivered orders without going as far as paid.
      // PrestaShop REST filter syntax for OR is `[a|b|c]`.
      const states = (process.env.PS_ORDER_SYNC_STATES || "4,5")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const filterValue = states.length === 1 ? states[0] : `[${states.join("|")}]`;
      (filters as any).filter = { current_state: filterValue };
    }

    const items = await ps.list<{ id: number }>(resourceType as any, filters as any);

    const results = [];
    for (const item of items) {
      if (resourceType === "products") results.push(await engine.syncSingleProduct(item.id, jobId));
      else if (resourceType === "customers") results.push(await engine.syncSingleCustomer(item.id, jobId));
      else if (resourceType === "orders") results.push(await engine.syncSingleOrder(item.id, jobId));
    }

    // Aggregate results for stats
    const counts = {
      created: results.filter((r) => r.action === "create").length,
      updated: results.filter((r) => r.action === "update").length,
      skipped: results.filter((r) => r.action === "skip").length,
      errors: results.filter((r) => r.action === "error").length,
      durationMs: Date.now() - startTime,
    };

    const singularType = resourceType.replace(/s$/, "");
    await recordSyncStats(prisma, singularType, counts).catch(() => {});

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
