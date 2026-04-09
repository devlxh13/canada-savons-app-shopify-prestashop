import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status");
  const resourceType = searchParams.get("resourceType");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (status && status !== "all") where.status = status;
  if (resourceType) where.resourceType = resourceType;

  const [items, total, pendingCount, abandonedCount] = await Promise.all([
    (prisma as any).retryQueue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    (prisma as any).retryQueue.count({ where }),
    (prisma as any).retryQueue.count({ where: { status: "pending" } }),
    (prisma as any).retryQueue.count({ where: { status: "abandoned" } }),
  ]);

  return NextResponse.json({ items, total, pendingCount, abandonedCount, limit, offset });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, action } = body;

  if (action === "retry") {
    await (prisma as any).retryQueue.update({
      where: { id },
      data: { status: "pending", nextRetryAt: new Date() },
    });
  } else if (action === "dismiss") {
    await (prisma as any).retryQueue.update({
      where: { id },
      data: { status: "abandoned" },
    });
  }

  return NextResponse.json({ ok: true });
}
