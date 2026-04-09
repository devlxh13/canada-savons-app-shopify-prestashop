import { describe, it, expect, vi } from "vitest";
import {
  withImmediateRetry,
  computeDeferredNextRetry,
  IMMEDIATE_MAX_ATTEMPTS,
  DEFERRED_MAX_ATTEMPTS,
} from "@/lib/sync/retry";

/** Zero-delay function for instant test execution */
const noDelay = () => 0;

describe("withImmediateRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi
      .fn()
      .mockResolvedValue({ psId: 1, action: "create", shopifyGid: "gid://1" });
    const result = await withImmediateRetry(fn, noDelay);
    expect(result).toEqual({
      psId: 1,
      action: "create",
      shopifyGid: "gid://1",
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries up to 3 times then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("API down"));
    await expect(withImmediateRetry(fn, noDelay)).rejects.toThrow("API down");
    expect(fn).toHaveBeenCalledTimes(IMMEDIATE_MAX_ATTEMPTS);
  });

  it("succeeds on second attempt", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValue({ psId: 1, action: "create", shopifyGid: "gid://1" });
    const result = await withImmediateRetry(fn, noDelay);
    expect(result.action).toBe("create");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("computeDeferredNextRetry", () => {
  it("returns 15min delay for attempts 4-6", () => {
    const now = new Date("2026-04-09T10:00:00Z");
    expect(computeDeferredNextRetry(4, now)).toEqual(
      new Date("2026-04-09T10:15:00Z"),
    );
    expect(computeDeferredNextRetry(6, now)).toEqual(
      new Date("2026-04-09T10:15:00Z"),
    );
  });

  it("returns 1h delay for attempts 7-8", () => {
    const now = new Date("2026-04-09T10:00:00Z");
    expect(computeDeferredNextRetry(7, now)).toEqual(
      new Date("2026-04-09T11:00:00Z"),
    );
  });

  it("returns 4h delay for attempts 9-10", () => {
    const now = new Date("2026-04-09T10:00:00Z");
    expect(computeDeferredNextRetry(9, now)).toEqual(
      new Date("2026-04-09T14:00:00Z"),
    );
  });
});

describe("constants", () => {
  it("IMMEDIATE_MAX_ATTEMPTS is 3", () => {
    expect(IMMEDIATE_MAX_ATTEMPTS).toBe(3);
  });

  it("DEFERRED_MAX_ATTEMPTS is 10", () => {
    expect(DEFERRED_MAX_ATTEMPTS).toBe(10);
  });
});
