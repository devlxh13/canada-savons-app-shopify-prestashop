import { describe, it, expect } from "vitest";
import { transformProduct, transformCustomer } from "@/lib/sync/transform";
import type { PSProduct, PSCustomer } from "@/lib/prestashop/types";

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

    const result = transformProduct(psProduct, 2);

    expect(result.title).toBe("Foot Cream - 150ml");
    expect(result.bodyHtml).toBe("<p>Description EN</p>");
    expect(result.vendor).toBe("La Maison du Savon de Marseille");
    expect(result.status).toBe("ACTIVE");
    expect(result.variants[0].price).toBe("39.00");
    expect(result.variants[0].sku).toBe("M26037");
    expect(result.variants[0].weight).toBe(0.15);
    expect(result.variants[0].barcode).toBe("3760298170371");
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

    expect(transformProduct(psProduct, 1).status).toBe("DRAFT");
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
