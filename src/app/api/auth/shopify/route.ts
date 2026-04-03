import { NextRequest, NextResponse } from "next/server";
import { shopify } from "@/lib/shopify/auth";

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  const authRoute = await shopify.auth.begin({
    shop,
    callbackPath: "/api/auth/shopify/callback",
    isOnline: false,
    rawRequest: request,
  });

  return NextResponse.redirect(authRoute);
}
