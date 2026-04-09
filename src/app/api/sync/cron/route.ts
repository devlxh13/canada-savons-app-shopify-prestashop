import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getScheduledResources } from "@/lib/cron/dispatcher";
import { computeNextRun } from "@/lib/cron/schedule";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await (prisma as any).cronConfig.findMany();
  const now = new Date();
  const due = getScheduledResources(configs, now);
  const baseUrl = request.nextUrl.origin;
  const launched: string[] = [];

  for (const resource of due) {
    const jobId = `cron-${resource.resourceType}-${Date.now()}`;

    try {
      const syncUrl = resource.resourceType === "inventory"
        ? `${baseUrl}/api/sync?resourceType=products&jobId=${encodeURIComponent(jobId)}`
        : `${baseUrl}/api/sync?resourceType=${resource.resourceType}&jobId=${encodeURIComponent(jobId)}`;

      fetch(syncUrl, { method: "POST" }).catch(() => {});

      const nextRunAt = computeNextRun(resource.cronExpression, now);
      await (prisma as any).cronConfig.update({
        where: { resourceType: resource.resourceType },
        data: { lastRunAt: now, lastJobId: jobId, nextRunAt },
      });

      launched.push(resource.resourceType);
    } catch {
      // Log but continue with other resources
    }
  }

  // Also trigger retry processing
  try {
    fetch(`${baseUrl}/api/sync/retry`, { method: "POST" }).catch(() => {});
  } catch {
    // Non-fatal
  }

  return NextResponse.json({ status: "dispatched", launched, checkedAt: now.toISOString() });
}
