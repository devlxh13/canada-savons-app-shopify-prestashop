import { createHash } from "crypto";

export function contentHash(data: unknown): string {
  const sorted = JSON.stringify(data, Object.keys(data as object).sort());
  return createHash("sha256").update(sorted).digest("hex").slice(0, 16);
}
