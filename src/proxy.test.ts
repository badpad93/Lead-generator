import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Middleware-level behavior. The Supabase clients are stubbed so no
 * network call happens; the auth gate is exercised with "no session".
 */
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null } }),
    },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
}));

import { proxy } from "./proxy";

const PREVIEW_HOST = "lead-generator-git-claude-v-030322-jamespadden93-9369s-projects.vercel.app";
const saved: Record<string, string | undefined> = {};
const env = process.env as Record<string, string | undefined>;

function req(path: string, host = PREVIEW_HOST, cookies: Record<string, string> = {}): NextRequest {
  const r = new NextRequest(`https://${host}${path}`, { headers: { host } });
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
}

beforeEach(() => {
  for (const k of ["VERCEL_ENV", "NODE_ENV"]) saved[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "anon-placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "service-placeholder";
});
afterEach(() => {
  for (const k of ["VERCEL_ENV", "NODE_ENV"]) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe("canonical-host redirect in the proxy", () => {
  it("production: a noncanonical host gets a 301 to vendingconnector.com with path and query preserved", async () => {
    process.env.VERCEL_ENV = "production";
    const res = await proxy(req("/assistant?tab=1"));
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://vendingconnector.com/assistant?tab=1");
  });

  it("production: the canonical host itself is not redirected", async () => {
    process.env.VERCEL_ENV = "production";
    const res = await proxy(req("/", "vendingconnector.com"));
    expect(res.status).toBe(200);
  });

  it("preview: stays on the preview host", async () => {
    process.env.VERCEL_ENV = "preview";
    env.NODE_ENV = "production";
    const res = await proxy(req("/assistant"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("development: no redirect", async () => {
    process.env.VERCEL_ENV = "development";
    const res = await proxy(req("/assistant"));
    expect(res.status).toBe(200);
  });

  it("unset VERCEL_ENV: no redirect even when NODE_ENV=production", async () => {
    delete process.env.VERCEL_ENV;
    env.NODE_ENV = "production";
    const res = await proxy(req("/assistant"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // A protected path still goes to the auth gate, never to the canonical host.
    const gated = await proxy(req("/dashboard"));
    expect(gated.status).toBe(307);
    expect(new URL(gated.headers.get("location")!).hostname).toBe(PREVIEW_HOST);
  });
});

describe("existing gates are unchanged on a preview host", () => {
  beforeEach(() => {
    process.env.VERCEL_ENV = "preview";
  });

  it("protected pages still bounce signed-out visitors to /login with the redirect param", async () => {
    const res = await proxy(req("/dashboard"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("redirect")).toBe("/dashboard");
  });

  it("/assistant passes through with the minimal-shell request header stamped (no site nav/footer)", async () => {
    process.env.VERCEL_ENV = "preview";
    const res = await proxy(req("/assistant"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-request-x-vc-customer-shell")).toBe("1");
    // A client-supplied value is discarded on an ordinary route.
    const plain = new NextRequest(`https://${PREVIEW_HOST}/marketplace`, { headers: { host: PREVIEW_HOST, "x-vc-customer-shell": "1" } });
    expect((await proxy(plain)).headers.get("x-middleware-request-x-vc-customer-shell")).toBeNull();
  });

  it("public pages pass through", async () => {
    for (const p of ["/", "/login", "/assistant", "/coffee/o/twelve28"]) {
      const res = await proxy(req(p));
      expect(res.status, p).toBe(200);
    }
  });

  it("API routes pass through without an auth gate or canonical redirect", async () => {
    process.env.VERCEL_ENV = "production";
    const res = await proxy(req("/api/assistant/threads"));
    expect(res.status).toBe(200);
  });

  it("the storefront-customer lock still blocks non-allowlisted APIs and allows the assistant API", async () => {
    const lock = { vc_sf_lock: "abcd1234.twelve28" };
    const blocked = await proxy(req("/api/sales/leads", PREVIEW_HOST, lock));
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("CUSTOMER_RESTRICTED");
    const allowed = await proxy(req("/api/assistant/threads", PREVIEW_HOST, lock));
    expect(allowed.status).toBe(200);
  });
});
