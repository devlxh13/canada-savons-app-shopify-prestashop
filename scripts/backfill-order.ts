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

  // If the re-sync succeeded AND there was a previous Shopify order, archive
  // the old one: tag it `prestashop-superseded` and append ` | Replaced by <new-gid>`
  // to its note. This keeps history intact while letting the merchant filter
  // duplicates in Shopify admin. See LXH-273.
  const oldGid = before?.shopifyGid as string | undefined;
  const newGid = result.action === "create" ? result.shopifyGid : undefined;
  if (oldGid && newGid && oldGid !== newGid) {
    try {
      await shopifyClient.tagAndNoteOrder(oldGid, {
        addTag: "prestashop-superseded",
        noteSuffix: ` | Replaced by ${newGid}`,
      });
      console.log(`[backfill] archived old Shopify order ${oldGid} -> new ${newGid}`);
    } catch (err) {
      console.error(
        `[backfill] failed to archive old Shopify order ${oldGid}:`,
        err instanceof Error ? err.message : err
      );
    }
  } else if (oldGid && !newGid) {
    console.log(`[backfill] skipped archival — re-sync did not create a new order (old=${oldGid})`);
  }

  console.log("[backfill] old gid:", oldGid ?? "(none)");
  console.log("[backfill] new gid:", newGid ?? "(none)");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[backfill] error:", err);
  process.exit(1);
});
