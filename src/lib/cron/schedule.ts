import { CronExpressionParser } from "cron-parser";

export const FREQUENCY_PRESETS = [
  { label: "15min", cron: "*/15 * * * *" },
  { label: "30min", cron: "*/30 * * * *" },
  { label: "1h", cron: "0 * * * *" },
  { label: "2h", cron: "0 */2 * * *" },
  { label: "4h", cron: "0 */4 * * *" },
  { label: "6h", cron: "0 */6 * * *" },
  { label: "12h", cron: "0 */12 * * *" },
  { label: "1x/jour", cron: "0 7 * * *" },
] as const;

export function computeNextRun(cronExpression: string, from: Date): Date {
  const interval = CronExpressionParser.parse(cronExpression, {
    currentDate: from,
    tz: "UTC",
  });
  return interval.next().toDate();
}

export function cronToLabel(cronExpression: string): string {
  const preset = FREQUENCY_PRESETS.find((p) => p.cron === cronExpression);
  return preset?.label ?? cronExpression;
}
