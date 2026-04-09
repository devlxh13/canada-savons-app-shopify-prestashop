import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const resourceType = searchParams.get("resourceType");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const since = searchParams.get("since");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (resourceType) where.resourceType = resourceType;
  if (since) where.lastSyncedAt = { gte: new Date(since) };
  if (search) where.psId = { contains: search };

  const [mappings, total] = await Promise.all([
    prisma.idMapping.findMany({ where, orderBy: { lastSyncedAt: "desc" }, take: limit, skip: offset }),
    prisma.idMapping.count({ where }),
  ]);

  return NextResponse.json({ data: mappings, total, limit, offset });
}
