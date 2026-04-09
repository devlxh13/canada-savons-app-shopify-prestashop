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

export function transformOrder(
  order: PSOrder,
  customerGid: string,
  lineItems: { variantId: string; quantity: number }[],
  shippingAddress?: Record<string, string>,
  billingAddress?: Record<string, string>
) {
  return {
    customerId: customerGid,
    lineItems,
    shippingAddress,
    billingAddress,
    financialStatus: "PAID",
    note: `Imported from PrestaShop — Ref: ${order.reference}`,
    tags: ["prestashop-import"],
  };
}
