import { describe, it, expect } from "vitest";
import { transformProduct, transformCustomer, transformOrder } from "@/lib/sync/transform";
import type { PSProduct, PSCustomer, PSOrder } from "@/lib/prestashop/types";

describe("transformProduct", () => {
  it("transforms a PS product to Shopify format", () => {
    const psProduct: PSProduct = {
      id: 992,
      id_manufacturer: "2",
      id_category_default: "2",
      id_default_image: "1093",
      reference: "M26037",
      price: "39.000000",
      active: "1",
      name: [
        { id: "1", value: "Crème Pieds - 150ml" },
        { id: "2", value: "Foot Cream - 150ml" },
      ],
      description: [
        { id: "1", value: "<p>Description FR</p>" },
        { id: "2", value: "<p>Description EN</p>" },
      ],
      description_short: [
        { id: "1", value: "<p>Court FR</p>" },
        { id: "2", value: "<p>Short EN</p>" },
      ],
      link_rewrite: [
        { id: "1", value: "creme-pieds" },
        { id: "2", value: "foot-cream" },
      ],
      meta_title: [{ id: "1", value: "" }, { id: "2", value: "" }],
      meta_description: [{ id: "1", value: "" }, { id: "2", value: "" }],
      weight: "0.150000",
      ean13: "3760298170371",
      id_tax_rules_group: "1",
      date_add: "2021-09-23 14:43:02",
      date_upd: "2025-10-25 11:12:00",
      associations: {
        categories: [{ id: "2" }],
        images: [{ id: "1093" }],
        stock_availables: [{ id: "5178", id_product_attribute: "0" }],
      },
    };

    const result = transformProduct(psProduct);

    expect(result.product.title).toBe("Crème Pieds - 150ml");
    expect(result.product.descriptionHtml).toBe("<p>Description FR</p>");
    expect(result.product.vendor).toBe("La Maison du Savon de Marseille");
    expect(result.product.status).toBe("ACTIVE");
    expect(result.variant.price).toBe("39.00");
    expect(result.sku).toBe("M26037");
    expect(result.variant.barcode).toBe("3760298170371");
  });

  it("sets status to DRAFT when product is inactive", () => {
    const psProduct: PSProduct = {
      id: 1, id_manufacturer: "1", id_category_default: "2",
      id_default_image: "1", reference: "REF", price: "10.000000",
      active: "0",
      name: [{ id: "1", value: "Test" }],
      description: [{ id: "1", value: "" }],
      description_short: [{ id: "1", value: "" }],
      link_rewrite: [{ id: "1", value: "test" }],
      meta_title: [{ id: "1", value: "" }],
      meta_description: [{ id: "1", value: "" }],
      weight: "0", ean13: "", id_tax_rules_group: "1", date_add: "", date_upd: "",
      associations: {},
    };

    expect(transformProduct(psProduct, 1).product.status).toBe("DRAFT");
  });
});

describe("transformCustomer", () => {
  it("transforms a PS customer to Shopify format", () => {
    const psCustomer: PSCustomer = {
      id: 1, firstname: "Jean", lastname: "Dupont",
      email: "jean@example.com", active: "1",
      date_add: "2023-01-01", date_upd: "2023-06-01",
    };

    const result = transformCustomer(psCustomer);
    expect(result.firstName).toBe("Jean");
    expect(result.lastName).toBe("Dupont");
    expect(result.email).toBe("jean@example.com");
  });
});

describe("transformOrder", () => {
  const baseOrder: PSOrder = {
    id: 5128,
    id_customer: "42",
    id_cart: "1",
    id_currency: "1",
    current_state: "2",
    payment: "Cheque",
    total_paid: "91.96",
    total_paid_tax_incl: "91.96",
    total_paid_tax_excl: "85.00",
    total_shipping: "0.00",
    total_products: "85.00",
    date_add: "2025-12-15 10:30:00",
    date_upd: "2026-01-05 14:00:00",
    reference: "JORAAGVOR",
  };
  const lineItems = [
    {
      variantId: "gid://shopify/ProductVariant/1",
      quantity: 2,
      unitPriceTaxIncl: "45.978503",
    },
  ];
  const customerGid = "gid://shopify/Customer/99";

  it("backdates the order using PS date_add as processedAt ISO", () => {
    const result = transformOrder(baseOrder, customerGid, lineItems);
    expect(result.processedAt).toBe("2025-12-15T10:30:00.000Z");
  });

  it("omits processedAt when date_add is empty", () => {
    const order = { ...baseOrder, date_add: "" };
    const result = transformOrder(order, customerGid, lineItems);
    expect(result.processedAt).toBeUndefined();
  });

  it("sets fulfillmentStatus=FULFILLED for shipped PS state (4)", () => {
    const order = { ...baseOrder, current_state: "4" };
    const result = transformOrder(order, customerGid, lineItems);
    expect(result.fulfillmentStatus).toBe("FULFILLED");
  });

  it("sets fulfillmentStatus=FULFILLED for delivered PS state (5)", () => {
    const order = { ...baseOrder, current_state: "5" };
    const result = transformOrder(order, customerGid, lineItems);
    expect(result.fulfillmentStatus).toBe("FULFILLED");
  });

  it("omits fulfillmentStatus for paid-but-not-shipped state (2)", () => {
    const result = transformOrder(baseOrder, customerGid, lineItems);
    expect(result.fulfillmentStatus).toBeUndefined();
  });

  it("preserves existing fields (financialStatus, note, tags, customer)", () => {
    const result = transformOrder(baseOrder, customerGid, lineItems);
    expect(result.financialStatus).toBe("PAID");
    expect(result.note).toBe("Imported from PrestaShop — Ref: JORAAGVOR");
    expect(result.tags).toEqual(["prestashop-import"]);
    expect(result.customer).toEqual({ toAssociate: { id: customerGid } });
  });

  it("builds line items with 2-decimal priceSet rounded from unit_price_tax_incl", () => {
    const result = transformOrder(baseOrder, customerGid, lineItems);
    expect(result.lineItems).toEqual([
      {
        variantId: "gid://shopify/ProductVariant/1",
        quantity: 2,
        priceSet: {
          shopMoney: { amount: "45.98", currencyCode: "CAD" },
        },
      },
    ]);
  });

  it("declares currency=CAD and taxesIncluded=true on the order", () => {
    const result = transformOrder(baseOrder, customerGid, lineItems);
    expect(result.currency).toBe("CAD");
    expect(result.taxesIncluded).toBe(true);
  });

  it("adds shippingLines when total_shipping > 0 and sum matches PS total", () => {
    // 2 × 45.98 + 13.80 = 105.76
    const order = {
      ...baseOrder,
      total_paid_tax_incl: "105.76",
      total_shipping: "13.800000",
    };
    const result = transformOrder(order, customerGid, lineItems);
    expect(result.shippingLines).toEqual([
      {
        title: "PrestaShop Shipping",
        priceSet: {
          shopMoney: { amount: "13.80", currencyCode: "CAD" },
        },
      },
    ]);
  });

  it("omits shippingLines when total_shipping is 0", () => {
    // 2 × 45.98 = 91.96 already matches baseOrder.total_paid_tax_incl
    const result = transformOrder(baseOrder, customerGid, lineItems);
    expect(result.shippingLines).toBeUndefined();
  });

  it("absorbs rounding gap into shippingLines so Shopify total = total_paid_tax_incl", () => {
    // JORAAGVOR real numbers: PS total 94.24, Shopify naive total 94.25
    const order = {
      ...baseOrder,
      total_paid_tax_incl: "94.240000",
      total_shipping: "13.800000",
    };
    const items = [
      { variantId: "gid://shopify/ProductVariant/1", quantity: 1, unitPriceTaxIncl: "45.978503" },
      { variantId: "gid://shopify/ProductVariant/2", quantity: 3, unitPriceTaxIncl: "11.486003" },
    ];
    const result = transformOrder(order, customerGid, items);

    // Round each unit to 2 decimals, sum × qty, add adjusted shipping → must equal 94.24
    const subtotal = 45.98 * 1 + 11.49 * 3;
    const adjustedShipping = parseFloat(result.shippingLines![0].priceSet.shopMoney.amount);
    expect(subtotal + adjustedShipping).toBeCloseTo(94.24, 2);
    // Specifically: shipping absorbed 0.01 → 13.79
    expect(result.shippingLines![0].priceSet.shopMoney.amount).toBe("13.79");
  });

  it("leaves shipping untouched when naive total already matches PS total", () => {
    const order = {
      ...baseOrder,
      total_paid_tax_incl: "105.78",
      total_shipping: "5.00",
    };
    const items = [
      { variantId: "gid://shopify/ProductVariant/1", quantity: 2, unitPriceTaxIncl: "50.39" },
    ];
    const result = transformOrder(order, customerGid, items);

    expect(result.shippingLines![0].priceSet.shopMoney.amount).toBe("5.00");
  });

  it("emits a fixed discountCode when total_discounts_tax_incl > 0", () => {
    // 2 × 45.98 - 5.00 discount + 8.84 shipping = 95.80
    const order = {
      ...baseOrder,
      total_discounts_tax_incl: "5.00",
      total_paid_tax_incl: "95.80",
      total_shipping: "8.84",
    };
    const result = transformOrder(order, customerGid, lineItems);

    expect(result.discountCode).toEqual({
      itemFixedDiscountCode: {
        amountSet: { shopMoney: { amount: "5.00", currencyCode: "CAD" } },
        code: "PRESTASHOP_DISCOUNT",
      },
    });
  });

  it("omits discountCode when total_discounts_tax_incl is missing or 0", () => {
    expect(transformOrder(baseOrder, customerGid, lineItems).discountCode).toBeUndefined();
    const order = { ...baseOrder, total_discounts_tax_incl: "0.00" };
    expect(transformOrder(order, customerGid, lineItems).discountCode).toBeUndefined();
  });

  it("accounts for the global discount when computing the penny gap", () => {
    // 2 × 45.98 = 91.96, discount 5.00, shipping 8.83 (intentionally off by 0.01)
    // PS total: 91.96 - 5.00 + 8.83 = 95.79 → after fix shipping becomes 8.84
    const order = {
      ...baseOrder,
      total_discounts_tax_incl: "5.00",
      total_paid_tax_incl: "95.80",
      total_shipping: "8.83",
    };
    const result = transformOrder(order, customerGid, lineItems);

    expect(result.shippingLines![0].priceSet.shopMoney.amount).toBe("8.84");
  });

  it("builds a custom line item (no variantId) when the PS product was deleted", () => {
    const items = [
      {
        quantity: 2,
        unitPriceTaxIncl: "45.978503",
        title: "Porte Savon Mural (deleted PS product)",
        sku: "M41003",
      },
    ];
    const result = transformOrder(baseOrder, customerGid, items);

    expect(result.lineItems).toEqual([
      {
        quantity: 2,
        priceSet: { shopMoney: { amount: "45.98", currencyCode: "CAD" } },
        title: "Porte Savon Mural (deleted PS product)",
        sku: "M41003",
      },
    ]);
    // Must not carry a variantId key at all
    expect((result.lineItems[0] as Record<string, unknown>).variantId).toBeUndefined();
  });
});
