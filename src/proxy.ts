import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

const PUBLIC_PATHS = ["/login", "/api/"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths (login, all API routes)
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  // 1. Check JWT session cookie (fast path, no DB)
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      return NextResponse.next();
    }
  }

  // 2. Check shop param from Shopify admin
  const shop = request.nextUrl.searchParams.get("shop");
  if (shop) {
    return NextResponse.next();
  }

  // 3. Fallback: check if a valid Shopify OAuth session exists in DB
  //    (handles iframe where cookies are blocked by the browser)
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT 1 FROM sessions
      WHERE access_token IS NOT NULL
      LIMIT 1
    `;
    if (rows.length > 0) {
      return NextResponse.next();
    }
  } catch {
    // DB unreachable — fall through to login
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
