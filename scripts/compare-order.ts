/**
 * Compare a PS order (by id) and its imported Shopify counterpart.
 * Used to diagnose CA / totals mismatches.
 *
 *   npx tsx --env-file=.env.local scripts/compare-order.ts <psOrderId>
 */
import "@shopify/shopify-api/adapters/node";
import { shopify } from "@/lib/shopify/auth";
import { prisma } from "@/lib/db";
import { PSApiClient } from "@/lib/prestashop/api-client";
import type { PSOrder } from "@/lib/prestashop/types";

async function main() {
  const psId = parseInt(process.argv[2] ?? "", 10);
  if (Number.isNaN(psId)) {
    console.error("usage: compare-order.ts <psOrderId>");
    process.exit(1);
  }

  // PS side — API direct (DB host unreachable outside OVH network)
  const api = new PSApiClient(
    process.env.PRESTASHOP_API_URL!,
    process.env.PRESTASHOP_API_KEY!
  );

  let psOrder: PSOrder | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i < 3 && !psOrder; i++) {
    try {
      psOrder = await api.get<PSOrder>("orders", psId);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!psOrder) {
    console.error("PS API failed after 3 retries:", lastErr);
    process.exit(1);
  }

  console.log("=== PrestaShop order (API) ===");
  console.log({
    id: psOrder.id,
    reference: psOrder.reference,
    current_state: psOrder.current_state,
    id_currency: psOrder.id_currency,
    total_paid: psOrder.total_paid,
    total_paid_tax_incl: psOrder.total_paid_tax_incl,
    total_paid_tax_excl: psOrder.total_paid_tax_excl,
    total_shipping: psOrder.total_shipping,
    total_products: psOrder.total_products,
    date_add: psOrder.date_add,
  });
  console.log("PS order_rows:");
  console.log(psOrder.associations?.order_rows ?? "(none)");

  // Shopify side (via id_mapping)
  const mapping = await (prisma as any).idMapping.findUnique({
    where: { resourceType_psId: { resourceType: "order", psId } },
  });
  if (!mapping?.shopifyGid) {
    console.log("(no Shopify mapping found)");
    await prisma.$disconnect();
    return;
  }

  const session = await prisma.session.findFirst({
    where: { accessToken: { not: null } },
  });
  if (!session?.accessToken) throw new Error("No Shopify session");
  const graphqlClient = new shopify.clients.Graphql({ session: session as any });

  const query = `query o($id: ID!) {
    order(id: $id) {
      id name
      processedAt createdAt
      displayFinancialStatus displayFulfillmentStatus
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
    }
  }`;

  const response = await (graphqlClient as any).request(query, {
    variables: { id: mapping.shopifyGid },
  });
  console.log("\n=== Shopify order ===");
  console.log(JSON.stringify(response.data ?? response, null, 2));

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
