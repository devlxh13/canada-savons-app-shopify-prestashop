import { NextRequest, NextResponse } from "next/server";
import { verifyToken, createToken, COOKIE_NAME } from "@/lib/auth";

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

  // Check JWT session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload) {
      return NextResponse.next();
    }
  }

  // If accessed from Shopify admin (shop + host params), auto-create a session
  const shop = request.nextUrl.searchParams.get("shop");
  const host = request.nextUrl.searchParams.get("host");
  if (shop && host) {
    const newToken = await createToken(`shopify:${shop}`);
    const response = NextResponse.next();
    response.cookies.set(COOKIE_NAME, newToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none", // Required for iframe
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
