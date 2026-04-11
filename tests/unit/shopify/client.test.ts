import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShopifyClient } from "@/lib/shopify/client";

describe("ShopifyClient", () => {
  let client: ShopifyClient;
  let mockGraphqlClient: { request: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockGraphqlClient = { request: vi.fn() };
    client = new ShopifyClient(mockGraphqlClient as any);
  });

  describe("listProducts", () => {
    it("queries products via GraphQL", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          products: {
            edges: [
              { node: { id: "gid://shopify/Product/1", title: "Savon", variants: { edges: [] }, images: { edges: [] } }, cursor: "abc" },
            ],
            pageInfo: { hasNextPage: false },
          },
        },
      });

      const result = await client.listProducts({ first: 10 });

      expect(mockGraphqlClient.request).toHaveBeenCalledWith(
        expect.stringContaining("products"),
        expect.any(Object)
      );
      expect(result.products).toHaveLength(1);
      expect(result.products[0].title).toBe("Savon");
    });
  });

  describe("createOrder", () => {
    const baseInput = {
      customerId: "gid://shopify/Customer/1",
      lineItems: [{ variantId: "gid://shopify/ProductVariant/10", quantity: 2 }],
      financialStatus: "PAID",
      note: "Imported from PrestaShop — Ref: JORAAGVOR",
      tags: ["prestashop-import"],
    };

    beforeEach(() => {
      mockGraphqlClient.request.mockResolvedValue({
        data: {
          orderCreate: {
            order: { id: "gid://shopify/Order/1" },
            userErrors: [],
          },
        },
      });
    });

    it("forwards processedAt to the orderCreate mutation input", async () => {
      await client.createOrder({ ...baseInput, processedAt: "2025-12-15T10:30:00.000Z" });

      const [, options] = mockGraphqlClient.request.mock.calls[0];
      expect(options.variables.order.processedAt).toBe("2025-12-15T10:30:00.000Z");
    });

    it("forwards fulfillmentStatus to the orderCreate mutation input", async () => {
      await client.createOrder({ ...baseInput, fulfillmentStatus: "FULFILLED" });

      const [, options] = mockGraphqlClient.request.mock.calls[0];
      expect(options.variables.order.fulfillmentStatus).toBe("FULFILLED");
    });

    it("omits processedAt and fulfillmentStatus when not provided", async () => {
      await client.createOrder(baseInput);

      const [, options] = mockGraphqlClient.request.mock.calls[0];
      expect(options.variables.order.processedAt).toBeUndefined();
      expect(options.variables.order.fulfillmentStatus).toBeUndefined();
    });

    it("forwards currency, taxesIncluded and priceSet on line items", async () => {
      await client.createOrder({
        ...baseInput,
        currency: "CAD",
        taxesIncluded: true,
        lineItems: [
          {
            variantId: "gid://shopify/ProductVariant/10",
            quantity: 2,
            priceSet: { shopMoney: { amount: "45.978503", currencyCode: "CAD" } },
          },
        ],
      });

      const [, options] = mockGraphqlClient.request.mock.calls[0];
      expect(options.variables.order.currency).toBe("CAD");
      expect(options.variables.order.taxesIncluded).toBe(true);
      expect(options.variables.order.lineItems[0].priceSet).toEqual({
        shopMoney: { amount: "45.978503", currencyCode: "CAD" },
      });
    });

    it("forwards shippingLines to the orderCreate input", async () => {
      await client.createOrder({
        ...baseInput,
        shippingLines: [
          {
            title: "PrestaShop Shipping",
            priceSet: { shopMoney: { amount: "13.800000", currencyCode: "CAD" } },
          },
        ],
      });

      const [, options] = mockGraphqlClient.request.mock.calls[0];
      expect(options.variables.order.shippingLines).toEqual([
        {
          title: "PrestaShop Shipping",
          priceSet: { shopMoney: { amount: "13.800000", currencyCode: "CAD" } },
        },
      ]);
    });
  });

  describe("tagAndNoteOrder", () => {
    const oldGid = "gid://shopify/Order/111";
    const newGid = "gid://shopify/Order/222";

    it("reads current note, then tags the order and appends suffix via orderUpdate", async () => {
      // 1) order(id:) query → returns the current note
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          order: { id: oldGid, note: "Imported from PrestaShop — Ref: JORAAGVOR" },
        },
      });
      // 2) tagsAdd → OK
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          tagsAdd: {
            node: { id: oldGid },
            userErrors: [],
          },
        },
      });
      // 3) orderUpdate → OK
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          orderUpdate: {
            order: { id: oldGid, note: `Imported from PrestaShop — Ref: JORAAGVOR | Replaced by ${newGid}` },
            userErrors: [],
          },
        },
      });

      await client.tagAndNoteOrder(oldGid, {
        addTag: "prestashop-superseded",
        noteSuffix: ` | Replaced by ${newGid}`,
      });

      expect(mockGraphqlClient.request).toHaveBeenCalledTimes(3);

      // Call 1: read current note
      const [readQuery, readOpts] = mockGraphqlClient.request.mock.calls[0];
      expect(readQuery).toContain("order(id:");
      expect(readQuery).toContain("note");
      expect(readOpts.variables).toEqual({ id: oldGid });

      // Call 2: tagsAdd with id + tags
      const [tagQuery, tagOpts] = mockGraphqlClient.request.mock.calls[1];
      expect(tagQuery).toContain("tagsAdd");
      expect(tagOpts.variables).toEqual({
        id: oldGid,
        tags: ["prestashop-superseded"],
      });

      // Call 3: orderUpdate with id + appended note
      const [updateQuery, updateOpts] = mockGraphqlClient.request.mock.calls[2];
      expect(updateQuery).toContain("orderUpdate");
      expect(updateOpts.variables).toEqual({
        input: {
          id: oldGid,
          note: `Imported from PrestaShop — Ref: JORAAGVOR | Replaced by ${newGid}`,
        },
      });
    });

    it("handles a null existing note by using the suffix as-is", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: { order: { id: oldGid, note: null } },
      });
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: { tagsAdd: { node: { id: oldGid }, userErrors: [] } },
      });
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          orderUpdate: {
            order: { id: oldGid, note: ` | Replaced by ${newGid}` },
            userErrors: [],
          },
        },
      });

      await client.tagAndNoteOrder(oldGid, {
        addTag: "prestashop-superseded",
        noteSuffix: ` | Replaced by ${newGid}`,
      });

      const [, updateOpts] = mockGraphqlClient.request.mock.calls[2];
      expect(updateOpts.variables.input.note).toBe(` | Replaced by ${newGid}`);
    });

    it("throws when tagsAdd returns userErrors", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: { order: { id: oldGid, note: "x" } },
      });
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          tagsAdd: {
            node: null,
            userErrors: [{ field: ["id"], message: "Order not found" }],
          },
        },
      });

      await expect(
        client.tagAndNoteOrder(oldGid, {
          addTag: "prestashop-superseded",
          noteSuffix: " | Replaced by gid://shopify/Order/222",
        })
      ).rejects.toThrow("Order not found");
    });

    it("throws when orderUpdate returns userErrors", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: { order: { id: oldGid, note: "x" } },
      });
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: { tagsAdd: { node: { id: oldGid }, userErrors: [] } },
      });
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          orderUpdate: {
            order: null,
            userErrors: [{ field: ["note"], message: "Note too long" }],
          },
        },
      });

      await expect(
        client.tagAndNoteOrder(oldGid, {
          addTag: "prestashop-superseded",
          noteSuffix: " | Replaced by gid://shopify/Order/222",
        })
      ).rejects.toThrow("Note too long");
    });
  });

  describe("createProduct", () => {
    it("creates a product via productCreate mutation", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          productCreate: {
            product: { id: "gid://shopify/Product/1", title: "Savon" },
            userErrors: [],
          },
        },
      });

      const result = await client.createProduct({
        title: "Savon",
        bodyHtml: "<p>A soap</p>",
        vendor: "La Maison du Savon",
        productType: "Soap",
        status: "DRAFT",
      });

      expect(result.id).toBe("gid://shopify/Product/1");
    });

    it("throws on user errors", async () => {
      mockGraphqlClient.request.mockResolvedValueOnce({
        data: {
          productCreate: {
            product: null,
            userErrors: [{ field: ["title"], message: "Title is required" }],
          },
        },
      });

      await expect(
        client.createProduct({ title: "", bodyHtml: "", vendor: "", productType: "", status: "DRAFT" })
      ).rejects.toThrow("Title is required");
    });
  });
});
