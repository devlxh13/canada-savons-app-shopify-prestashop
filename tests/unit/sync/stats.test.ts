import { describe, it, expect, vi } from "vitest";
import { recordSyncStats } from "@/lib/sync/stats";

describe("recordSyncStats", () => {
  it("upserts stats for today", async () => {
    const mockPrisma = {
      syncStat: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    await recordSyncStats(mockPrisma as any, "product", {
      created: 5,
      updated: 3,
      skipped: 10,
      errors: 1,
      durationMs: 12345,
    });

    expect(mockPrisma.syncStat.upsert).toHaveBeenCalledTimes(1);
    const call = mockPrisma.syncStat.upsert.mock.calls[0][0];
    expect(call.where.date_resourceType.resourceType).toBe("product");
    expect(call.create.created).toBe(5);
    expect(call.update.created.increment).toBe(5);
  });

  it("truncates date to day boundary", async () => {
    const mockPrisma = {
      syncStat: { upsert: vi.fn().mockResolvedValue({}) },
    };

    await recordSyncStats(mockPrisma as any, "customer", {
      created: 1, updated: 0, skipped: 0, errors: 0, durationMs: 100,
    });

    const call = mockPrisma.syncStat.upsert.mock.calls[0][0];
    const date = call.where.date_resourceType.date as Date;
    expect(date.getUTCHours()).toBe(0);
    expect(date.getUTCMinutes()).toBe(0);
  });
});
