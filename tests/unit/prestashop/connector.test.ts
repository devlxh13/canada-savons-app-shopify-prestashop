import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSConnector } from "@/lib/prestashop/connector";
import type { PSApiClient } from "@/lib/prestashop/api-client";
import type { PSDbClient } from "@/lib/prestashop/db-client";

describe("PSConnector", () => {
  let mockApiClient: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> };
  let mockDbClient: { listProducts: ReturnType<typeof vi.fn>; getProduct: ReturnType<typeof vi.fn> };
  let connector: PSConnector;

  beforeEach(() => {
    mockApiClient = { list: vi.fn(), get: vi.fn(), search: vi.fn() };
    mockDbClient = { listProducts: vi.fn(), getProduct: vi.fn() };
    connector = new PSConnector(
      mockApiClient as unknown as PSApiClient,
      mockDbClient as unknown as PSDbClient
    );
  });

  it("uses API client by default", async () => {
    const products = [{ id: 1, name: "Savon" }];
    mockApiClient.list.mockResolvedValueOnce(products);
    const result = await connector.list("products");
    expect(mockApiClient.list).toHaveBeenCalledWith("products", undefined);
    expect(result).toEqual(products);
  });

  it("falls back to DB when API fails", async () => {
    mockApiClient.list.mockRejectedValueOnce(new Error("API error"));
    const dbProducts = [{ id: 1, name: "Savon from DB" }];
    mockDbClient.listProducts.mockResolvedValueOnce(dbProducts);
    const result = await connector.list("products");
    expect(mockDbClient.listProducts).toHaveBeenCalled();
    expect(result).toEqual(dbProducts);
  });

  it("throws when both API and DB fail", async () => {
    mockApiClient.list.mockRejectedValueOnce(new Error("API error"));
    mockDbClient.listProducts.mockRejectedValueOnce(new Error("DB error"));
    await expect(connector.list("products")).rejects.toThrow("DB error");
  });
});
