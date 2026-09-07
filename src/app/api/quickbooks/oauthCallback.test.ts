import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mintOAuthState, QB_OAUTH_STATE_COOKIE } from "@/lib/quickbooksOAuthState";

/**
 * The callback must not touch the live QuickBooks connection unless the
 * signed state matches the cookie, the initiator is still an admin, and
 * the token exchange succeeded — and it must update in place rather than
 * delete-then-insert.
 */
const dbCalls: string[] = [];
const profiles: Record<string, { role: string }> = { "admin-1": { role: "admin" }, "user-2": { role: "operator" } };
let existingConnection: { id: string } | null = { id: "conn-1" };
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: profiles[id] ?? null, error: null }) }),
        limit: () => ({ maybeSingle: async () => ({ data: existingConnection, error: null }) }),
      }),
      update: (row: Record<string, unknown>) => ({ eq: async () => { dbCalls.push(`${table}.update:${row.realm_id}`); return { error: null }; } }),
      insert: async (row: Record<string, unknown>) => { dbCalls.push(`${table}.insert:${row.realm_id}`); return { error: null }; },
      delete: () => { dbCalls.push(`${table}.delete`); return { neq: async () => ({ error: null }) }; },
    }),
  },
}));
const exchange = vi.fn(async () => ({ access_token: "a", refresh_token: "r", expires_in: 3600, x_refresh_token_expires_in: 1, token_type: "bearer" }));
vi.mock("@/lib/quickbooks", () => ({ exchangeCodeForTokens: (...a: unknown[]) => exchange(...(a as [])), getAccountingApiBase: () => "https://sandbox-quickbooks.api.intuit.com" }));

import { GET } from "./oauth/callback/route";

const env = { QB_CLIENT_SECRET: "s3" };
function req(query: Record<string, string>, cookie?: string): NextRequest {
  const url = new URL("https://vendingconnector.com/api/quickbooks/oauth/callback");
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const r = new NextRequest(url, { headers: cookie ? { cookie: `${QB_OAUTH_STATE_COOKIE}=${cookie}` } : {} });
  return r;
}

beforeEach(() => {
  dbCalls.length = 0;
  exchange.mockClear();
  process.env.QB_CLIENT_SECRET = env.QB_CLIENT_SECRET;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ CompanyInfo: { CompanyName: "Acme" } }), { status: 200 })));
  existingConnection = { id: "conn-1" };
});

describe("QuickBooks OAuth callback", () => {
  it("refuses without a valid matching state and never calls Intuit or the database", async () => {
    const s = mintOAuthState("admin-1");
    for (const r of [req({ code: "c", realmId: "R" }), req({ code: "c", realmId: "R", state: s }), req({ code: "c", realmId: "R", state: s }, mintOAuthState("admin-1"))]) {
      const res = await GET(r);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("qb=error");
    }
    expect(exchange).not.toHaveBeenCalled();
    expect(dbCalls).toEqual([]);
  });

  it("refuses when the initiator is no longer an admin", async () => {
    const s = mintOAuthState("user-2");
    const res = await GET(req({ code: "c", realmId: "R", state: s }, s));
    expect(res.headers.get("location")).toContain("Admin+access+required");
    expect(exchange).not.toHaveBeenCalled();
    expect(dbCalls).toEqual([]);
  });

  it("updates the existing connection in place after a successful exchange (no delete)", async () => {
    const s = mintOAuthState("admin-1");
    const res = await GET(req({ code: "c", realmId: "R9", state: s }, s));
    expect(res.headers.get("location")).toContain("qb=connected");
    expect(dbCalls).toEqual(["quickbooks_connection.update:R9"]);
    expect(dbCalls.some((c) => c.includes("delete"))).toBe(false);
    // The single-use state cookie is cleared.
    expect(res.headers.get("set-cookie")).toContain(`${QB_OAUTH_STATE_COOKIE}=;`);
  });

  it("leaves the existing connection untouched when the token exchange fails", async () => {
    exchange.mockRejectedValueOnce(new Error("QB token exchange failed: bad code"));
    const s = mintOAuthState("admin-1");
    const res = await GET(req({ code: "bad", realmId: "R9", state: s }, s));
    expect(res.headers.get("location")).toContain("qb=error");
    expect(dbCalls).toEqual([]);
  });

  it("inserts when no connection exists yet", async () => {
    existingConnection = null;
    const s = mintOAuthState("admin-1");
    await GET(req({ code: "c", realmId: "R9", state: s }, s));
    expect(dbCalls).toEqual(["quickbooks_connection.insert:R9"]);
  });
});
