import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const days = parseInt(searchParams.get("days") ?? "7");
  const resourceType = searchParams.get("resourceType");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const where: Record<string, unknown> = { date: { gte: since } };
  if (resourceType) where.resourceType = resourceType;

  const stats = await (prisma as any).syncStat.findMany({
    where,
    orderBy: { date: "asc" },
  });

  return NextResponse.json(stats);
}
