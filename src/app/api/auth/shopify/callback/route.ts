import { NextRequest, NextResponse } from "next/server";
import { getShopifyApi } from "@/lib/shopify/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const shopifyApi = getShopifyApi();
    const url = request.nextUrl;

    const shop = url.searchParams.get("shop");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!shop || !code || !state) {
      return NextResponse.json({ error: "Missing OAuth parameters" }, { status: 400 });
    }

    // Verify nonce from database (cookies don't work in Shopify admin iframe)
    const existingSession = await prisma.session.findUnique({
      where: { id: `offline_${shop}` },
    });
    if (!existingSession?.state || existingSession.state !== state) {
      return NextResponse.json({ error: "Invalid state/nonce" }, { status: 403 });
    }

    // Exchange code for access token
    const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: shopifyApi.config.apiKey,
        client_secret: shopifyApi.config.apiSecretKey,
        code,
      }),
    });

    if (!accessTokenResponse.ok) {
      const errText = await accessTokenResponse.text();
      return NextResponse.json({ error: `Token exchange failed: ${errText}` }, { status: 500 });
    }

    const tokenData = await accessTokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;

    // Store session in Neon
    await prisma.session.upsert({
      where: { id: `offline_${shop}` },
      create: {
        id: `offline_${shop}`,
        shop,
        state: state,
        isOnline: false,
        scope,
        accessToken,
      },
      update: {
        accessToken,
        scope,
        state,
      },
    });

    // Redirect to dashboard with shop param (cookies don't work in Shopify iframe)
    const dashboardUrl = new URL("/", request.url);
    dashboardUrl.searchParams.set("shop", shop);
    return NextResponse.redirect(dashboardUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
