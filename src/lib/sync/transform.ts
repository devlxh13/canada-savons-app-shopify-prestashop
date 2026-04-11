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

// PS order states treated as fully fulfilled in Shopify.
// Standard PrestaShop install: 4=Shipped, 5=Delivered.
const PS_FULFILLED_STATES = new Set(["4", "5"]);

function psDateToISO(psDate: string): string | undefined {
  if (!psDate) return undefined;
  const d = new Date(`${psDate.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function transformOrder(
  order: PSOrder,
  customerGid: string,
  lineItems: { variantId: string; quantity: number }[],
  shippingAddress?: Record<string, string>,
  billingAddress?: Record<string, string>
) {
  const processedAt = psDateToISO(order.date_add);
  const fulfillmentStatus = PS_FULFILLED_STATES.has(order.current_state)
    ? ("FULFILLED" as const)
    : undefined;

  return {
    customerId: customerGid,
    lineItems,
    shippingAddress,
    billingAddress,
    financialStatus: "PAID",
    note: `Imported from PrestaShop — Ref: ${order.reference}`,
    tags: ["prestashop-import"],
    ...(processedAt && { processedAt }),
    ...(fulfillmentStatus && { fulfillmentStatus }),
  };
}
