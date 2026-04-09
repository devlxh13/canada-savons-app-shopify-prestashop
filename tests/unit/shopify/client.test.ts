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
