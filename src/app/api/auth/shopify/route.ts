import { NextRequest, NextResponse } from "next/server";
import { getShopifyApi } from "@/lib/shopify/auth";

export async function GET(request: NextRequest) {
  const shop = request.nextUrl.searchParams.get("shop");
  if (!shop) {
    return NextResponse.json({ error: "Missing shop parameter" }, { status: 400 });
  }

  try {
    const shopifyApi = getShopifyApi();
    const sanitizedShop = shopifyApi.utils.sanitizeShop(shop, true);
    if (!sanitizedShop) {
      return NextResponse.json({ error: "Invalid shop domain" }, { status: 400 });
    }

    const nonce = shopifyApi.auth.nonce();
    const scopes = shopifyApi.config.scopes?.toString() || "";
    const apiKey = shopifyApi.config.apiKey;
    const callbackUrl = `${process.env.SHOPIFY_APP_URL}/api/auth/shopify/callback`;

    const authUrl = `https://${sanitizedShop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${nonce}`;

    // Store nonce in a cookie for callback verification
    const response = NextResponse.redirect(authUrl);
    response.cookies.set("shopify_oauth_nonce", nonce, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
