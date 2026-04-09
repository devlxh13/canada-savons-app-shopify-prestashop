import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const configs = await (prisma as any).cronConfig.findMany({
    orderBy: { resourceType: "asc" },
  });
  return NextResponse.json(configs);
}
