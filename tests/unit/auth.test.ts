// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { createToken, requireAuth } from "@/lib/auth";

function mockRequest(options: {
  cookie?: string;
  authHeader?: string;
}): Request {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", `gateway-session=${options.cookie}`);
  if (options.authHeader) headers.set("authorization", options.authHeader);
  return new Request("https://example.com/api/sync", { method: "POST", headers });
}

describe("requireAuth", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
    process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";
  });

  it("rejects requests without cookie or Authorization header", async () => {
    const req = mockRequest({});
    const result = await requireAuth(req);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("accepts a request with a valid JWT session cookie", async () => {
    const token = await createToken("admin@example.com");
    const req = mockRequest({ cookie: token });
    const result = await requireAuth(req);
    expect(result.ok).toBe(true);
  });

  it("rejects a request with an invalid JWT cookie", async () => {
    const req = mockRequest({ cookie: "not-a-real-token" });
    const result = await requireAuth(req);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("accepts a request with the correct Bearer CRON_SECRET", async () => {
    const req = mockRequest({ authHeader: "Bearer test-cron-secret" });
    const result = await requireAuth(req);
    expect(result.ok).toBe(true);
  });

  it("rejects a request with a wrong Bearer token", async () => {
    const req = mockRequest({ authHeader: "Bearer wrong-secret" });
    const result = await requireAuth(req);
    expect(result).toEqual({ ok: false, status: 401 });
  });

  it("rejects when CRON_SECRET env is missing (fails closed)", async () => {
    delete process.env.CRON_SECRET;
    const req = mockRequest({ authHeader: "Bearer anything" });
    const result = await requireAuth(req);
    expect(result).toEqual({ ok: false, status: 401 });
  });
});
