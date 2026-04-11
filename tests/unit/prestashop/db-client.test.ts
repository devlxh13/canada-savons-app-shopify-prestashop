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

  describe("listOrderStates", () => {
    it("returns rows with shipped/delivered flags from ps_order_state", async () => {
      const rows = [
        { id_order_state: 4, shipped: 1, delivered: 0, paid: 1 },
        { id_order_state: 5, shipped: 0, delivered: 1, paid: 1 },
        { id_order_state: 2, shipped: 0, delivered: 0, paid: 1 },
      ];
      mockPool.query.mockResolvedValueOnce([rows]);

      const result = await client.listOrderStates();

      expect(result).toEqual(rows);
      expect(mockPool.query.mock.calls[0][0]).toContain("ps_order_state");
    });
  });

  describe("getOrder", () => {
    it("returns null when the order header is missing", async () => {
      mockPool.query.mockResolvedValueOnce([[]]);

      const result = await client.getOrder(999);

      expect(result).toBeNull();
    });

    it("returns a PSOrder-shaped object with associations.order_rows", async () => {
      const header = {
        id: 5128,
        id_customer: "42",
        id_cart: "1",
        id_currency: "2",
        current_state: "5",
        payment: "Cheque",
        total_paid: "94.240000",
        total_paid_tax_incl: "94.240000",
        total_paid_tax_excl: "81.960000",
        total_shipping: "13.800000",
        total_products: "69.960000",
        date_add: "2020-05-01 20:25:39",
        date_upd: "2020-05-05 12:00:00",
        reference: "JORAAGVOR",
      };
      const rows = [
        {
          id: "13409",
          product_id: "448",
          product_quantity: "1",
          product_price: "39.990000",
          product_name: "Porte Savon Mural",
          unit_price_tax_incl: "45.978503",
          unit_price_tax_excl: "39.990000",
        },
      ];
      mockPool.query.mockResolvedValueOnce([[header]]);
      mockPool.query.mockResolvedValueOnce([rows]);

      const result = await client.getOrder(5128);

      expect(result).toMatchObject({
        id: 5128,
        reference: "JORAAGVOR",
        total_paid: "94.240000",
        date_add: "2020-05-01 20:25:39",
      });
      const assoc = (result as Record<string, unknown>).associations as { order_rows: unknown };
      expect(assoc.order_rows).toEqual(rows);
    });

    it("queries ps_orders and ps_order_detail", async () => {
      mockPool.query.mockResolvedValueOnce([[{ id: 1, reference: "X" }]]);
      mockPool.query.mockResolvedValueOnce([[]]);

      await client.getOrder(1);

      const headerSql = mockPool.query.mock.calls[0][0];
      const detailSql = mockPool.query.mock.calls[1][0];
      expect(headerSql).toContain("ps_orders");
      expect(detailSql).toContain("ps_order_detail");
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
