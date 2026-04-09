import { describe, it, expect } from "vitest";
import { getScheduledResources } from "@/lib/cron/dispatcher";
import { computeNextRun } from "@/lib/cron/schedule";

describe("cron dispatch integration", () => {
  it("full cycle: detect due → compute next run", () => {
    const now = new Date("2026-04-09T12:05:00Z");

    const configs = [
      {
        id: "1",
        resourceType: "products",
        enabled: true,
        cronExpression: "0 */6 * * *",
        lastRunAt: new Date("2026-04-09T06:00:00Z"),
        nextRunAt: new Date("2026-04-09T12:00:00Z"),
        lastJobId: null,
      },
      {
        id: "2",
        resourceType: "customers",
        enabled: true,
        cronExpression: "0 7 * * *",
        lastRunAt: new Date("2026-04-09T07:00:00Z"),
        nextRunAt: new Date("2026-04-10T07:00:00Z"),
        lastJobId: null,
      },
    ];

    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(1);
    expect(due[0].resourceType).toBe("products");

    const nextRun = computeNextRun("0 */6 * * *", now);
    expect(nextRun).toEqual(new Date("2026-04-09T18:00:00Z"));
  });
});
