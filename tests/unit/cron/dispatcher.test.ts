import { describe, it, expect } from "vitest";
import { getScheduledResources } from "@/lib/cron/dispatcher";

describe("getScheduledResources", () => {
  it("returns resources whose nextRunAt is past", () => {
    const now = new Date("2026-04-09T12:00:00Z");
    const configs = [
      { resourceType: "products", enabled: true, nextRunAt: new Date("2026-04-09T11:00:00Z"), cronExpression: "0 */6 * * *" },
      { resourceType: "customers", enabled: true, nextRunAt: new Date("2026-04-09T13:00:00Z"), cronExpression: "0 7 * * *" },
      { resourceType: "orders", enabled: false, nextRunAt: new Date("2026-04-09T10:00:00Z"), cronExpression: "0 20 * * *" },
    ];

    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(1);
    expect(due[0].resourceType).toBe("products");
  });

  it("skips disabled resources even if overdue", () => {
    const now = new Date("2026-04-09T23:00:00Z");
    const configs = [
      { resourceType: "orders", enabled: false, nextRunAt: new Date("2026-04-09T10:00:00Z"), cronExpression: "0 20 * * *" },
    ];
    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(0);
  });

  it("includes resources with null nextRunAt (first run)", () => {
    const now = new Date("2026-04-09T12:00:00Z");
    const configs = [
      { resourceType: "inventory", enabled: true, nextRunAt: null, cronExpression: "0 */2 * * *" },
    ];
    const due = getScheduledResources(configs as any, now);
    expect(due).toHaveLength(1);
  });
});
