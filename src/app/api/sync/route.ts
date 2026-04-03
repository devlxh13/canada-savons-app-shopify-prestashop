import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { resourceType, psIds, batchSize, shop } = body;

  if (!resourceType || !shop) {
    return NextResponse.json({ error: "resourceType and shop are required" }, { status: 400 });
  }

  const eventName = psIds?.length === 1 ? "sync/single" : `sync/${resourceType}`;

  const { ids } = await inngest.send({
    name: eventName,
    data: { shop, resourceType, psIds: psIds ?? [], batchSize: batchSize ?? 50 },
  });

  return NextResponse.json({ jobId: ids[0], status: "queued" });
}
