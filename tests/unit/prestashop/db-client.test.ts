import { describe, it, expect, vi, beforeEach } from "vitest";
import { PSDbClient } from "@/lib/prestashop/db-client";

vi.mock("mysql2/promise", () => ({
  createPool: vi.fn(() => ({
    query: vi.fn(),
    end: vi.fn(),
  })),
}));

import { createPool } from "mysql2/promise";

describe("PSDbClient", () => {
  let client: PSDbClient;
  let mockPool: { query: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = {
      query: vi.fn(),
      end: vi.fn(),
    };
    (createPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
    client = new PSDbClient({
      host: "localhost",
      user: "test",
      password: "test",
      database: "test_db",
    });
  });

  describe("listProducts", () => {
    it("queries products with lang join and returns results", async () => {
      const mockRows = [
        { id: 1, name: "Savon", price: "10.00", active: 1 },
        { id: 2, name: "Crème", price: "20.00", active: 1 },
      ];
      mockPool.query.mockResolvedValueOnce([mockRows]);

      const result = await client.listProducts({ limit: 10, langId: 1 });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ps_product"),
        expect.any(Array)
      );
      expect(result).toEqual(mockRows);
    });
  });

  describe("getProduct", () => {
    it("queries a single product by ID", async () => {
      const mockRow = { id: 1, name: "Savon", price: "10.00" };
      mockPool.query.mockResolvedValueOnce([[mockRow]]);

      const result = await client.getProduct(1, 1);

      expect(result).toEqual(mockRow);
    });

    it("returns null when product not found", async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      const result = await client.getProduct(999, 1);

      expect(result).toBeNull();
    });
  });

  describe("getCustomer", () => {
    it("queries a single customer by ID and returns PSCustomer-shaped row", async () => {
      const mockRow = {
        id: 42,
        firstname: "Jean",
        lastname: "Dupont",
        email: "jean@example.com",
        active: 1,
        date_add: "2026-01-01 00:00:00",
        date_upd: "2026-02-01 00:00:00",
      };
      mockPool.query.mockResolvedValueOnce([[mockRow]]);

      const result = await client.getCustomer(42);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("ps_customer"),
        [42]
      );
      expect(result).toEqual(mockRow);
    });

    it("returns null when customer not found", async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      const result = await client.getCustomer(999);

      expect(result).toBeNull();
    });

    it("excludes soft-deleted customers", async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      await client.getCustomer(1);

      const [sql] = mockPool.query.mock.calls[0];
      expect(sql).toContain("deleted = 0");
    });
  });
});
