import { describe, it, expect } from "vitest";
import { computeNextRun, FREQUENCY_PRESETS } from "@/lib/cron/schedule";

describe("computeNextRun", () => {
  it("computes next run for every-2-hours cron", () => {
    const from = new Date("2026-04-09T10:00:00Z");
    const next = computeNextRun("0 */2 * * *", from);
    expect(next).toEqual(new Date("2026-04-09T12:00:00Z"));
  });

  it("computes next run for daily cron", () => {
    const from = new Date("2026-04-09T07:30:00Z");
    const next = computeNextRun("0 7 * * *", from);
    expect(next).toEqual(new Date("2026-04-10T07:00:00Z"));
  });

  it("computes next run for every-15-min cron", () => {
    const from = new Date("2026-04-09T10:05:00Z");
    const next = computeNextRun("*/15 * * * *", from);
    expect(next).toEqual(new Date("2026-04-09T10:15:00Z"));
  });
});

describe("FREQUENCY_PRESETS", () => {
  it("contains all expected presets", () => {
    const labels = FREQUENCY_PRESETS.map((p) => p.label);
    expect(labels).toContain("15min");
    expect(labels).toContain("1x/jour");
  });

  it("each preset has a valid cron expression", () => {
    for (const preset of FREQUENCY_PRESETS) {
      expect(() => computeNextRun(preset.cron, new Date())).not.toThrow();
    }
  });
});
