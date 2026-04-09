import { describe, it, expect, vi } from "vitest";
import { SyncEngine } from "@/lib/sync/engine";

describe("sync flow integration", () => {
  it("creates product and records result", async () => {
    const mockPs = {
      get: vi.fn().mockResolvedValue({
        id: 42,
        name: [{ id: "1", value: "Savon Lavande" }],
        description: [{ id: "1", value: "<p>Lavender soap</p>" }],
        description_short: [],
        meta_title: [],
        meta_description: [],
        link_rewrite: [{ id: "1", value: "savon-lavande" }],
        reference: "SAV-LAV-001",
        ean13: "3700000000001",
        price: "12.50",
        active: "1",
        id_tax_rules_group: "1",
        weight: "0.100",
        id_category_default: "3",
        id_default_image: "0",
        associations: {},
      }),
      list: vi.fn().mockResolvedValue([{ id_product: "42", quantity: "15" }]),
    };

    const mockShopify = {
      findExistingProduct: vi.fn().mockResolvedValue(null),
      createProduct: vi.fn().mockResolvedValue({ id: "gid://shopify/Product/100" }),
      setInventory: vi.fn().mockResolvedValue(undefined),
    };

    const mockPrisma = {
      idMapping: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({}),
      },
      syncLog: { create: vi.fn().mockResolvedValue({}) },
      retryQueue: { create: vi.fn().mockResolvedValue({}) },
    };

    const engine = new SyncEngine(mockPs as any, mockShopify as any, mockPrisma as any);
    const result = await engine.syncSingleProduct(42, "test-job");

    expect(result.action).toBe("create");
    expect(result.shopifyGid).toBe("gid://shopify/Product/100");
    expect(mockShopify.createProduct).toHaveBeenCalledTimes(1);
    expect(mockPrisma.idMapping.upsert).toHaveBeenCalledTimes(1);
    expect(mockPrisma.syncLog.create).toHaveBeenCalled();
  });

  it("queues to retry after 3 failures", async () => {
    const mockPs = {
      get: vi.fn().mockRejectedValue(new Error("PS API timeout")),
    };

    const mockPrisma = {
      idMapping: { findUnique: vi.fn() },
      syncLog: { create: vi.fn().mockResolvedValue({}) },
      retryQueue: { create: vi.fn().mockResolvedValue({}) },
    };

    const engine = new SyncEngine(mockPs as any, {} as any, mockPrisma as any);
    const result = await engine.syncSingleProduct(42, "test-job");

    expect(result.action).toBe("error");
    expect(mockPs.get).toHaveBeenCalledTimes(3);
    expect(mockPrisma.retryQueue.create).toHaveBeenCalledTimes(1);

    const retryData = mockPrisma.retryQueue.create.mock.calls[0][0].data;
    expect(retryData.status).toBe("pending");
    expect(retryData.attemptCount).toBe(3);
  }, 15000); // Allow time for retry delays
});
