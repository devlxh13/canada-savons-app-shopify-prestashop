import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSApiClient } from "@/lib/prestashop/api-client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("PSApiClient", () => {
  let client: PSApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new PSApiClient("https://example.com/api/", "test-api-key");
  });

  describe("list", () => {
    it("fetches a list of resources with correct auth and format", async () => {
      const mockProducts = {
        products: [
          { id: 1, name: [{ id: "1", value: "Product 1" }] },
          { id: 2, name: [{ id: "1", value: "Product 2" }] },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProducts),
      });

      const result = await client.list("products");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/api/products"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.stringContaining("Basic"),
          }),
        })
      );
      expect(result).toEqual(mockProducts.products);
    });

    it("applies filters to the URL", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ products: [] }),
      });

      await client.list("products", { limit: 10, offset: 20 });

      const url = mockFetch.mock.calls[0][0] as string;
      // PS API uses limit=offset,count format for pagination
      expect(url).toContain("limit=20%2C10");
    });
  });

  describe("get", () => {
    it("fetches a single resource by ID", async () => {
      const mockProduct = {
        product: { id: 1, name: [{ id: "1", value: "Product 1" }] },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockProduct),
      });

      const result = await client.get("products", 1);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("https://example.com/api/products/1"),
        expect.any(Object)
      );
      expect(result).toEqual(mockProduct.product);
    });
  });

  describe("search", () => {
    it("searches resources by name", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ products: [{ id: 1 }] }),
      });

      await client.search("products", "savon");

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("filter%5Bname%5D=%25savon%25");
    });
  });

  describe("error handling", () => {
    it("throws on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(client.list("products")).rejects.toThrow("PrestaShop API error: 401 Unauthorized");
    });
  });
});
