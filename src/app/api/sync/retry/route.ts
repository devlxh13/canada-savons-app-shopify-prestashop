// src/app/api/sync/retry/route.ts
import { NextResponse } from "next/server";
import { getPSConnector } from "@/lib/prestashop/registry";
import { shopify } from "@/lib/shopify/auth";
import { ShopifyClient } from "@/lib/shopify/client";
import { SyncEngine } from "@/lib/sync/engine";
import { prisma } from "@/lib/db";
import { computeDeferredNextRetry, DEFERRED_MAX_ATTEMPTS } from "@/lib/sync/retry";

export const maxDuration = 300;

export async function POST() {
  const now = new Date();
  const pending = await (prisma as any).retryQueue.findMany({
    where: {
      status: "pending",
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: "asc" },
    take: 50,
  });

  if (pending.length === 0) {
    return NextResponse.json({ status: "no_pending", processed: 0 });
  }

  const session = await prisma.session.findFirst({
    where: { accessToken: { not: null } },
  });
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No Shopify session" }, { status: 401 });
  }

  const graphqlClient = new shopify.clients.Graphql({ session: session as any });
  const shopifyClient = new ShopifyClient(graphqlClient as any);
  const ps = getPSConnector();
  const engine = new SyncEngine(ps, shopifyClient, prisma);

  const results = { resolved: 0, retrying: 0, abandoned: 0 };

  for (const item of pending) {
    await (prisma as any).retryQueue.update({
      where: { id: item.id },
      data: { status: "retrying" },
    });

    let result;
    const retryJobId = `retry-${item.jobId}-${Date.now()}`;

    try {
      if (item.resourceType === "product") {
        result = await engine.syncSingleProduct(item.psId, retryJobId);
      } else if (item.resourceType === "customer") {
        result = await engine.syncSingleCustomer(item.psId, retryJobId);
      } else if (item.resourceType === "order") {
        result = await engine.syncSingleOrder(item.psId, retryJobId);
      }
    } catch {
      result = { action: "error" };
    }

    if (result && result.action !== "error") {
      await (prisma as any).retryQueue.update({
        where: { id: item.id },
        data: { status: "resolved", updatedAt: new Date() },
      });
      results.resolved++;
    } else {
      const newAttemptCount = item.attemptCount + 1;
      if (newAttemptCount >= DEFERRED_MAX_ATTEMPTS) {
        await (prisma as any).retryQueue.update({
          where: { id: item.id },
          data: { status: "abandoned", attemptCount: newAttemptCount },
        });
        results.abandoned++;
      } else {
        await (prisma as any).retryQueue.update({
          where: { id: item.id },
          data: {
            status: "pending",
            attemptCount: newAttemptCount,
            lastError: result?.error ?? item.lastError,
            nextRetryAt: computeDeferredNextRetry(newAttemptCount, new Date()),
          },
        });
        results.retrying++;
      }
    }
  }

  return NextResponse.json({ status: "completed", ...results });
}
