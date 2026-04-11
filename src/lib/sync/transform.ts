import type { PSProduct, PSCustomer, PSOrder, PSMultiLangValue } from "@/lib/prestashop/types";

function getLangValue(values: PSMultiLangValue[], langId: number): string {
  return values.find((v) => v.id === String(langId))?.value ?? values[0]?.value ?? "";
}

export function transformProduct(ps: PSProduct, langId: number = 1) {
  return {
    product: {
      title: getLangValue(ps.name, langId),
      descriptionHtml: getLangValue(ps.description, langId) || getLangValue(ps.description_short, langId),
      vendor: "La Maison du Savon de Marseille",
      productType: "",
      handle: getLangValue(ps.link_rewrite, langId),
      status: ps.active === "1" ? ("ACTIVE" as const) : ("DRAFT" as const),
      seo: {
        title: getLangValue(ps.meta_title, langId),
        description: getLangValue(ps.meta_description, langId),
      },
    },
    variant: {
      price: parseFloat(ps.price).toFixed(2),
      barcode: ps.ean13 || "",
    },
    sku: ps.reference || "",
  };
}

export function transformCustomer(ps: PSCustomer) {
  return {
    firstName: ps.firstname,
    lastName: ps.lastname,
    email: ps.email,
  };
}

// Fallback mapping when the caller didn't resolve the state ids from the
// PrestaShop DB. Matches the standard install (4=Shipped, 5=Delivered).
const PS_FULFILLED_STATES_DEFAULT = new Set(["4", "5"]);

// Both PS and Shopify shop operate in CAD — no conversion needed.
const ORDER_CURRENCY = "CAD" as const;

function psDateToISO(psDate: string): string | undefined {
  if (!psDate) return undefined;
  const d = new Date(`${psDate.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function money(amount: string) {
  return { shopMoney: { amount, currencyCode: ORDER_CURRENCY } };
}

function toCents(amount: string): number {
  return Math.round(parseFloat(amount || "0") * 100);
}

function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * A PS order row, mid-way between the raw PrestaShop `order_detail` row and
 * the Shopify `OrderCreateLineItemInput` shape.
 *
 * When `variantId` is set, the line maps to an existing Shopify variant and
 * Shopify will resolve the title/sku itself. When it is omitted, the line is
 * emitted as a **custom line item** (no catalog reference) using the `title`
 * and `sku` from the original PS row — this keeps orders importable even
 * when the underlying PS product has been deleted or renamed since.
 */
export interface PsOrderLineItem {
  variantId?: string;
  quantity: number;
  unitPriceTaxIncl: string;
  title?: string;
  sku?: string;
}

export function transformOrder(
  order: PSOrder,
  customerGid: string,
  lineItems: PsOrderLineItem[],
  shippingAddress?: Record<string, string>,
  billingAddress?: Record<string, string>,
  fulfilledStateIds: Set<string> = PS_FULFILLED_STATES_DEFAULT
) {
  const processedAt = psDateToISO(order.date_add);
  const fulfillmentStatus = fulfilledStateIds.has(order.current_state)
    ? ("FULFILLED" as const)
    : undefined;

  // Round each unit price to 2 decimals (Shopify does this anyway) and keep
  // the rounded amount so we can compute the gap against the PS total.
  const shopifyLineItems = lineItems.map((li) => {
    const rounded = centsToAmount(toCents(li.unitPriceTaxIncl));
    return {
      quantity: li.quantity,
      priceSet: money(rounded),
      ...(li.variantId && { variantId: li.variantId }),
      ...(li.title && { title: li.title }),
      ...(li.sku && { sku: li.sku }),
    };
  });

  // Distribute the penny gap into the shipping line so
  // total_paid_tax_incl matches Shopify's recomputed total to the cent.
  const subtotalCents = shopifyLineItems.reduce(
    (acc, li) => acc + toCents(li.priceSet.shopMoney.amount) * li.quantity,
    0
  );
  const psTotalCents = toCents(order.total_paid_tax_incl || "0");
  const originalShippingCents = toCents(order.total_shipping || "0");
  const naiveShopifyTotal = subtotalCents + originalShippingCents;
  const delta = psTotalCents - naiveShopifyTotal;
  const adjustedShippingCents = originalShippingCents + delta;

  const shippingLines = adjustedShippingCents > 0
    ? [{ title: "PrestaShop Shipping", priceSet: money(centsToAmount(adjustedShippingCents)) }]
    : undefined;

  return {
    customer: { toAssociate: { id: customerGid } },
    currency: ORDER_CURRENCY,
    taxesIncluded: true,
    lineItems: shopifyLineItems,
    shippingAddress,
    billingAddress,
    financialStatus: "PAID",
    note: `Imported from PrestaShop — Ref: ${order.reference}`,
    tags: ["prestashop-import"],
    ...(processedAt && { processedAt }),
    ...(fulfillmentStatus && { fulfillmentStatus }),
    ...(shippingLines && { shippingLines }),
  };
}
