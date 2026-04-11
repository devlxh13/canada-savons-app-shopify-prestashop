/**
 * One-off backfill script: resync a single PrestaShop order to Shopify
 * using the current (fixed) sync code. Meant to correct orders imported
 * with wrong processedAt / fulfillmentStatus before LXH-263 landed.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-order.ts <psOrderId>
 */
import "@shopify/shopify-api/adapters/node";
import { shopify } from "@/lib/shopify/auth";
import { ShopifyClient } from "@/lib/shopify/client";
import { getPSConnector } from "@/lib/prestashop/registry";
import { SyncEngine } from "@/lib/sync/engine";
import { prisma } from "@/lib/db";

async function main() {
  const psIdArg = process.argv[2];
  if (!psIdArg) {
    console.error("usage: backfill-order.ts <psOrderId>");
    process.exit(1);
  }
  const psId = parseInt(psIdArg, 10);
  if (Number.isNaN(psId)) {
    console.error(`invalid psOrderId: ${psIdArg}`);
    process.exit(1);
  }

  const jobId = `backfill-order-${psId}-${Date.now()}`;
  console.log(`[backfill] jobId=${jobId} psId=${psId}`);

  // Snapshot: current mapping (if any)
  const before = await (prisma as any).idMapping.findUnique({
    where: { resourceType_psId: { resourceType: "order", psId } },
  });
  console.log("[backfill] existing mapping:", before ?? "(none)");

  // Delete existing mapping so syncSingleOrder recreates the order in Shopify
  if (before) {
    await (prisma as any).idMapping.delete({
      where: { resourceType_psId: { resourceType: "order", psId } },
    });
    console.log("[backfill] deleted existing mapping");
  }

  // Build engine with same wiring as /api/sync
  const session = await prisma.session.findFirst({
    where: { accessToken: { not: null } },
  });
  if (!session?.accessToken) throw new Error("No Shopify session in DB");

  const graphqlClient = new shopify.clients.Graphql({ session: session as any });
  const shopifyClient = new ShopifyClient(graphqlClient as any);
  const ps = getPSConnector();
  const engine = new SyncEngine(ps, shopifyClient, prisma);

  // Run
  const result = await engine.syncSingleOrder(psId, jobId);
  console.log("[backfill] result:", result);

  const after = await (prisma as any).idMapping.findUnique({
    where: { resourceType_psId: { resourceType: "order", psId } },
  });
  console.log("[backfill] new mapping:", after ?? "(none — sync failed)");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] error:", err);
  process.exit(1);
});
