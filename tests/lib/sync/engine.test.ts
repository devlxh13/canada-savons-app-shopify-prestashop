import { describe, it, expect, vi, beforeEach } from "vitest";
import { SyncEngine } from "@/lib/sync/engine";

describe("SyncEngine", () => {
  let mockPSConnector: { list: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  let mockShopifyClient: { createProduct: ReturnType<typeof vi.fn>; updateProduct: ReturnType<typeof vi.fn> };
  let mockPrisma: {
    idMapping: { findUnique: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    syncLog: { create: ReturnType<typeof vi.fn> };
  };
  let engine: SyncEngine;

  beforeEach(() => {
    mockPSConnector = { list: vi.fn(), get: vi.fn() };
    mockShopifyClient = { createProduct: vi.fn(), updateProduct: vi.fn() };
    mockPrisma = {
      idMapping: { findUnique: vi.fn(), upsert: vi.fn() },
      syncLog: { create: vi.fn() },
    };
    engine = new SyncEngine(mockPSConnector as any, mockShopifyClient as any, mockPrisma as any);
  });

  it("creates a new product when no mapping exists", async () => {
    mockPSConnector.get.mockResolvedValueOnce({
      id: 1, name: [{ id: "2", value: "Savon" }],
      description: [{ id: "2", value: "<p>Test</p>" }],
      description_short: [{ id: "2", value: "" }],
      link_rewrite: [{ id: "2", value: "savon" }],
      meta_title: [{ id: "2", value: "" }], meta_description: [{ id: "2", value: "" }],
      price: "10.000000", active: "1", reference: "REF1",
      weight: "0.1", ean13: "", id_manufacturer: "1",
      id_category_default: "2", id_default_image: "1",
      date_add: "", date_upd: "", associations: {},
    });
    mockPrisma.idMapping.findUnique.mockResolvedValueOnce(null);
    mockShopifyClient.createProduct.mockResolvedValueOnce({ id: "gid://shopify/Product/100", title: "Savon" });
    mockPrisma.idMapping.upsert.mockResolvedValueOnce({});
    mockPrisma.syncLog.create.mockResolvedValueOnce({});

    const result = await engine.syncSingleProduct(1, "test-job");

    expect(result.action).toBe("create");
    expect(result.shopifyGid).toBe("gid://shopify/Product/100");
    expect(mockShopifyClient.createProduct).toHaveBeenCalled();
  });

  it("skips when data hash matches", async () => {
    const { contentHash } = await import("@/lib/sync/hash");
    const { transformProduct } = await import("@/lib/sync/transform");

    const psData = {
      id: 1, name: [{ id: "2", value: "Savon" }],
      description: [{ id: "2", value: "" }], description_short: [{ id: "2", value: "" }],
      link_rewrite: [{ id: "2", value: "savon" }],
      meta_title: [{ id: "2", value: "" }], meta_description: [{ id: "2", value: "" }],
      price: "10.000000", active: "1", reference: "REF1",
      weight: "0", ean13: "", id_manufacturer: "1",
      id_category_default: "2", id_default_image: "1",
      date_add: "", date_upd: "", associations: {},
    };

    mockPSConnector.get.mockResolvedValueOnce(psData);
    const transformed = transformProduct(psData as any, 2);
    const hash = contentHash(transformed);

    mockPrisma.idMapping.findUnique.mockResolvedValueOnce({
      shopifyGid: "gid://shopify/Product/100", dataHash: hash, syncStatus: "synced",
    });
    mockPrisma.syncLog.create.mockResolvedValueOnce({});

    const result = await engine.syncSingleProduct(1, "test-job");

    expect(result.action).toBe("skip");
    expect(mockShopifyClient.createProduct).not.toHaveBeenCalled();
    expect(mockShopifyClient.updateProduct).not.toHaveBeenCalled();
  });
});
