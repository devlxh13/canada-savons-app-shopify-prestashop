import { NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";

export async function POST() {
  try {
    await inngest.send({ name: "sync/local-products" });
    return NextResponse.json({ status: "triggered" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
