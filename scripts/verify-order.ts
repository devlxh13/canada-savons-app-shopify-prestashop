/**
 * One-off verification: fetch a Shopify order by GID and print the fields
 * we care about for the LXH-263 backfill (createdAt, processedAt, fulfillmentStatus).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/verify-order.ts <orderGid>
 */
import "@shopify/shopify-api/adapters/node";
import { shopify } from "@/lib/shopify/auth";
import { prisma } from "@/lib/db";

async function main() {
  const gid = process.argv[2];
  if (!gid) {
    console.error("usage: verify-order.ts <orderGid>");
    process.exit(1);
  }

  const session = await prisma.session.findFirst({
    where: { accessToken: { not: null } },
  });
  if (!session?.accessToken) throw new Error("No Shopify session in DB");

  const graphqlClient = new shopify.clients.Graphql({ session: session as any });

  const query = `query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      processedAt
      displayFulfillmentStatus
      displayFinancialStatus
      note
      tags
      totalPriceSet { shopMoney { amount currencyCode } }
    }
  }`;

  const response = await (graphqlClient as any).request(query, {
    variables: { id: gid },
  });

  console.log(JSON.stringify(response.data ?? response, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
