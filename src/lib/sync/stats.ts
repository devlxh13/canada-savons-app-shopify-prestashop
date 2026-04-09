import type { PrismaClient } from "@prisma/client";

interface StatCounts {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function recordSyncStats(
  prisma: PrismaClient,
  resourceType: string,
  counts: StatCounts
): Promise<void> {
  const date = todayUTC();

  await (prisma as any).syncStat.upsert({
    where: { date_resourceType: { date, resourceType } },
    create: {
      date,
      resourceType,
      ...counts,
    },
    update: {
      created: { increment: counts.created },
      updated: { increment: counts.updated },
      skipped: { increment: counts.skipped },
      errors: { increment: counts.errors },
      durationMs: { increment: counts.durationMs },
    },
  });
}
