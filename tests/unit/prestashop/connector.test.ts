import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSConnector } from "@/lib/prestashop/connector";
import type { PSApiClient } from "@/lib/prestashop/api-client";
import type { PSDbClient } from "@/lib/prestashop/db-client";

describe("PSConnector", () => {
  let mockApiClient: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn> };
  let mockDbClient: {
    listProducts: ReturnType<typeof vi.fn>;
    getProduct: ReturnType<typeof vi.fn>;
    listCustomers: ReturnType<typeof vi.fn>;
    getCustomer: ReturnType<typeof vi.fn>;
  };
  let connector: PSConnector;

  beforeEach(() => {
    mockApiClient = { list: vi.fn(), get: vi.fn(), search: vi.fn() };
    mockDbClient = {
      listProducts: vi.fn(),
      getProduct: vi.fn(),
      listCustomers: vi.fn(),
      getCustomer: vi.fn(),
    };
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

  it("falls back to dbClient.getCustomer when customer API get fails", async () => {
    mockApiClient.get.mockRejectedValueOnce(new Error("API error"));
    const dbCustomer = { id: 42, firstname: "Jean", lastname: "Dupont", email: "jean@example.com" };
    mockDbClient.getCustomer.mockResolvedValueOnce(dbCustomer);

    const result = await connector.get("customers", 42);

    expect(mockDbClient.getCustomer).toHaveBeenCalledWith(42);
    expect(result).toEqual(dbCustomer);
  });

  it("throws 'not found' when customer absent from both API and DB", async () => {
    mockApiClient.get.mockRejectedValueOnce(new Error("API error"));
    mockDbClient.getCustomer.mockResolvedValueOnce(null);

    await expect(connector.get("customers", 999)).rejects.toThrow("customers #999 not found");
  });
});
