import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await requireAuth(request);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: auth.status });
  const { jobId } = await params;

  const logs = await prisma.syncLog.findMany({
    where: { jobId },
    orderBy: { createdAt: "desc" },
  });

  const total = logs.length;
  const created = logs.filter((l) => l.action === "create").length;
  const updated = logs.filter((l) => l.action === "update").length;
  const skipped = logs.filter((l) => l.action === "skip").length;
  const errors = logs.filter((l) => l.action === "error").length;

  return NextResponse.json({ jobId, total, created, updated, skipped, errors, logs });
}
