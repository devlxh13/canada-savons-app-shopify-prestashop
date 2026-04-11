import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "gateway-session";

export { COOKIE_NAME };

function getAuthSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "default-secret-change-me");
}

export async function createToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(getAuthSecret());
}

export async function verifyToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return payload as { email: string };
  } catch {
    return null;
  }
}

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 };

/**
 * Gate any API route that should not be publicly callable.
 *
 * Accepts either:
 *   - a valid JWT session cookie (UI flow)
 *   - an `Authorization: Bearer <CRON_SECRET>` header (cron/scripts)
 *
 * Fails closed if `CRON_SECRET` is not configured — returns 401 even when
 * a bearer header is present, so a misconfigured deploy cannot accidentally
 * open up the surface.
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  // 1. JWT cookie (UI)
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (match) {
    const token = match.slice(COOKIE_NAME.length + 1);
    const payload = await verifyToken(token);
    if (payload) return { ok: true };
  }

  // 2. Bearer CRON_SECRET (external triggers)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true };
  }

  return { ok: false, status: 401 };
}
