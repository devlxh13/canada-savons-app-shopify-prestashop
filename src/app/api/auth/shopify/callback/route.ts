import { NextRequest, NextResponse } from "next/server";
import { shopify, sessionStorage } from "@/lib/shopify/auth";

export async function GET(request: NextRequest) {
  const callback = await shopify.auth.callback({
    rawRequest: request,
  });

  await sessionStorage.storeSession(callback.session);

  return NextResponse.redirect(new URL("/", request.url));
}
