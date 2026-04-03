import { describe, it, expect } from "vitest";
import { contentHash } from "@/lib/sync/hash";

describe("contentHash", () => {
  it("produces a consistent hash for the same input", () => {
    const data = { name: "Savon", price: "10.00" };
    expect(contentHash(data)).toBe(contentHash(data));
  });

  it("produces different hashes for different input", () => {
    expect(contentHash({ name: "Savon" })).not.toBe(contentHash({ name: "Crème" }));
  });

  it("ignores key order", () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
  });
});
