import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const jobId = searchParams.get("jobId");
  const resourceType = searchParams.get("resourceType");
  const action = searchParams.get("action");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (jobId) where.jobId = jobId;
  if (resourceType) where.resourceType = resourceType;
  if (action) where.action = action;

  const [logs, total] = await Promise.all([
    prisma.syncLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
    prisma.syncLog.count({ where }),
  ]);

  return NextResponse.json({ data: logs, total, limit, offset });
}
