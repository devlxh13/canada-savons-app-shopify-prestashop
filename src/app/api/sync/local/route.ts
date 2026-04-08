import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { syncProductsToLocal } from "@/lib/sync/local-sync";
import { getPSConnector } from "@/lib/prestashop/registry";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const direct = searchParams.get("direct") === "true";

  try {
    if (direct) {
      const jobId = `local-sync-${Date.now()}`;
      const result = await syncProductsToLocal(getPSConnector(), prisma, jobId);
      return NextResponse.json({ status: "completed", ...result });
    }

    await inngest.send({ name: "sync/local-products" });
    return NextResponse.json({ status: "triggered" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
