import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { buildCategoryLookup, buildStockLookup, syncProductBatch, deleteStaleProducts, logSyncComplete } from "@/lib/sync/local-sync";
import { getPSConnector } from "@/lib/prestashop/registry";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const BATCH_SIZE = 50;

export const maxDuration = 300;

// GET is called by Vercel Cron, POST by the UI button and self-chaining
export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}

async function handleSync(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const searchParams = request.nextUrl.searchParams;
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const jobId = searchParams.get("jobId") ?? `local-sync-${Date.now()}`;

  try {
    const ps = getPSConnector();
    const categoryLookup = await buildCategoryLookup(ps);
    const stockLookup = await buildStockLookup(ps);

    const batchResult = await syncProductBatch(ps, prisma, jobId, categoryLookup, stockLookup, offset, BATCH_SIZE);

    if (batchResult.total < BATCH_SIZE) {
      // Last batch — get all psIds from DB and cleanup stale ones
      const allProducts = await (prisma as any).product.findMany({ select: { psId: true } });
      const allPsIds = allProducts.map((p: { psId: number }) => p.psId);

      // Only delete products that weren't touched in this sync job
      const deleted = await deleteStaleProducts(prisma, allPsIds);
      await logSyncComplete(prisma, jobId, {
        totalProducts: allPsIds.length,
        lastBatch: { offset, ...batchResult },
        deleted,
      });

      return NextResponse.json({
        status: "completed",
        totalProducts: allPsIds.length,
        batch: { offset, ...batchResult },
        deleted,
      });
    }

    // More batches — chain next batch in background
    const nextOffset = offset + BATCH_SIZE;
    const baseUrl = request.nextUrl.origin;
    const nextUrl = `${baseUrl}/api/sync/local?offset=${nextOffset}&jobId=${encodeURIComponent(jobId)}`;

    after(async () => {
      try {
        await fetch(nextUrl, { method: "POST" });
      } catch {
        // next batch will be picked up by next cron run
      }
    });

    return NextResponse.json({
      status: "in_progress",
      batch: { offset, ...batchResult },
      nextOffset,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
