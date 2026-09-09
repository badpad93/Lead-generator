import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * SSRF hardening of the QuickBooks OAuth callback: the realmId query value is
 * validated before the token exchange and before any Accounting API URL is
 * built from it. A hostile value must produce an error redirect with zero
 * outbound requests and zero database writes; a valid one must reach exactly
 * the company-info endpoint on the configured host. No network, no database.
 */
const BASE = "https://quickbooks.api.intuit.com";
type Tokens = { access_token: string; refresh_token: string; expires_in: number };
const exchange = vi.fn<(code: string, redirectUri: string) => Promise<Tokens>>(async () => ({ access_token: "AT", refresh_token: "RT", expires_in: 3600 }));
vi.mock("@/lib/quickbooks", () => ({
  exchangeCodeForTokens: (code: string, redirectUri: string) => exchange(code, redirectUri),
  getAccountingApiBase: () => BASE,
}));
const inserted: Array<Record<string, unknown>> = [];
const deleted: string[] = [];
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      delete: () => ({ neq: async () => { deleted.push(table); return { error: null }; } }),
      insert: async (row: Record<string, unknown>) => { inserted.push({ table, ...row }); return { error: null }; },
    }),
  },
}));
type FakeResponse = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<FakeResponse>>(async () => ({ ok: true, json: async () => ({ CompanyInfo: { CompanyName: "Acme Vending" } }) }));
vi.stubGlobal("fetch", fetchMock);

import { GET } from "./oauth/callback/route";

function callback(params: Record<string, string>) {
  const url = new URL("https://vendingconnector.com/api/quickbooks/oauth/callback");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return GET(new NextRequest(url));
}

beforeEach(() => {
  exchange.mockClear();
  fetchMock.mockClear();
  inserted.length = 0;
  deleted.length = 0;
  process.env.NEXT_PUBLIC_SITE_URL = "https://vendingconnector.com";
});
afterAll(() => vi.unstubAllGlobals());

describe("QuickBooks OAuth callback realm validation", () => {
  it("connects a valid realm: one company-info request on the configured host, then the connection row", async () => {
    const res = await callback({ code: "abc", realmId: "9130357857777777" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://vendingconnector.com/admin?qb=connected&company=Acme%20Vending");
    expect(exchange).toHaveBeenCalledWith("abc", "https://vendingconnector.com/api/quickbooks/oauth/callback");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/v3/company/9130357857777777/companyinfo/9130357857777777`);
    expect(new URL(url).origin).toBe(BASE);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer AT");
    expect(deleted).toEqual(["quickbooks_connection"]);
    expect(inserted).toEqual([{ table: "quickbooks_connection", realm_id: "9130357857777777", access_token: "AT", refresh_token: "RT", token_expires_at: expect.any(String), company_name: "Acme Vending" }]);
  });

  it("rejects hostile realm ids before the token exchange, with no request and no write", async () => {
    const hostile = [
      "../../../v3/company/1",
      "9130/../../evil",
      "9130%2F..%2Fevil",
      "9130/companyinfo/1?x=",
      "9130@evil.example",
      "evil.example.com",
      "https://evil.example/v3/company/1",
      "//evil.example/",
      "9130#",
      "9130 ",
      "9130\n",
      "-9130",
      "1e5",
      "１２３４",
      "1".repeat(33),
      " ",
    ];
    for (const realmId of hostile) {
      const res = await callback({ code: "abc", realmId });
      expect(res.status, realmId).toBe(307);
      expect(res.headers.get("location"), realmId).toBe("https://vendingconnector.com/admin?qb=error&message=Invalid+realmId");
    }
    expect(exchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("keeps the pre-existing missing-parameter and provider-error paths", async () => {
    expect((await callback({ code: "abc" })).headers.get("location")).toBe("https://vendingconnector.com/admin?qb=error&message=Missing+code+or+realmId");
    expect((await callback({ realmId: "9130" })).headers.get("location")).toBe("https://vendingconnector.com/admin?qb=error&message=Missing+code+or+realmId");
    expect((await callback({ code: "abc", realmId: "../x", error: "access_denied" })).headers.get("location")).toBe("https://vendingconnector.com/admin?qb=error&message=access_denied");
    expect(exchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still stores the connection when the company lookup fails", async () => {
    fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({}) }));
    const res = await callback({ code: "abc", realmId: "42" });
    expect(res.headers.get("location")).toBe("https://vendingconnector.com/admin?qb=connected&company=");
    expect(inserted[0]).toMatchObject({ realm_id: "42", company_name: "" });
  });
});
