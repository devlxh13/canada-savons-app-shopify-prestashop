import type { CronConfig } from "@prisma/client";

export interface ScheduledResource {
  resourceType: string;
  cronExpression: string;
}

export function getScheduledResources(
  configs: CronConfig[],
  now: Date
): ScheduledResource[] {
  return configs
    .filter((c) => c.enabled && (c.nextRunAt === null || c.nextRunAt <= now))
    .map((c) => ({ resourceType: c.resourceType, cronExpression: c.cronExpression }));
}
