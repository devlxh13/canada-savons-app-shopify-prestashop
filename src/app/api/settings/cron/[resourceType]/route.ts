import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { computeNextRun } from "@/lib/cron/schedule";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ resourceType: string }> }
) {
  const { resourceType } = await params;
  const body = await request.json();
  const { cronExpression, enabled } = body;

  const data: Record<string, unknown> = {};
  if (cronExpression !== undefined) data.cronExpression = cronExpression;
  if (enabled !== undefined) data.enabled = enabled;

  if (cronExpression || enabled !== undefined) {
    const current = await (prisma as any).cronConfig.findUnique({
      where: { resourceType },
    });
    if (current) {
      const expr = cronExpression ?? current.cronExpression;
      const isEnabled = enabled ?? current.enabled;
      data.nextRunAt = isEnabled ? computeNextRun(expr, new Date()) : null;
    }
  }

  const updated = await (prisma as any).cronConfig.update({
    where: { resourceType },
    data,
  });

  return NextResponse.json(updated);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ resourceType: string }> }
) {
  const { resourceType } = await params;
  const baseUrl = request.nextUrl.origin;
  const jobId = `manual-${resourceType}-${Date.now()}`;

  const syncResourceType = resourceType === "inventory" ? "products" : resourceType;
  const syncUrl = `${baseUrl}/api/sync?resourceType=${syncResourceType}&jobId=${encodeURIComponent(jobId)}`;

  fetch(syncUrl, { method: "POST" }).catch(() => {});

  await (prisma as any).cronConfig.update({
    where: { resourceType },
    data: { lastRunAt: new Date(), lastJobId: jobId },
  });

  return NextResponse.json({ status: "launched", jobId });
}
