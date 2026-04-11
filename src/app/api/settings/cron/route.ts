import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const configs = await (prisma as any).cronConfig.findMany({
    orderBy: { resourceType: "asc" },
  });
  return NextResponse.json(configs);
}
