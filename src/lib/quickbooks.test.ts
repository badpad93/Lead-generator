import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

/**
 * QuickBooks library guarantees that Vinnie checkout depends on. No
 * network: the connection row comes from a stubbed supabaseAdmin and
 * every Intuit call is a scripted fetch.
 */
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        limit: () => {
          const row = { data: { id: "C1", realm_id: "R1", access_token: "tok", refresh_token: "r", token_expires_at: new Date(Date.now() + 3_600_000).toISOString(), company_name: "Test Co" }, error: null };
          return { maybeSingle: async () => row, single: async () => row };
        },
      }),
    }),
  },
}));

import { createInvoice, getInvoiceWithLink, isTrustedInvoiceLink, verifyWebhookSignature } from "./quickbooks";

const calls: Array<{ url: string; body: unknown }> = [];
function scriptFetch(responses: Array<() => Response>) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return next();
  }));
}
const json = (v: unknown, status = 200) => () => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  calls.length = 0;
  process.env.QB_ENVIRONMENT = "sandbox";
  delete process.env.VERCEL_ENV;
});

describe("isTrustedInvoiceLink", () => {
  it("accepts https Intuit hosts only", () => {
    expect(isTrustedInvoiceLink("https://connect.intuit.com/portal/app/CommerceNetwork/view/abc")).toBe(true);
    expect(isTrustedInvoiceLink("https://app.qbo.intuit.com/x")).toBe(true);
    expect(isTrustedInvoiceLink("https://quickbooks.com/pay/1")).toBe(true);
    for (const bad of ["http://connect.intuit.com/x", "https://intuit.com.evil.example/x", "https://evil.example/intuit.com", "javascript:alert(1)", "", null, undefined, "not a url"]) {
      expect(isTrustedInvoiceLink(bad)).toBe(false);
    }
  });
});

describe("verifyWebhookSignature", () => {
  const token = "verifier-token";
  const body = '{"eventNotifications":[]}';
  const good = createHmac("sha256", token).update(body).digest("base64");
  it("accepts the exact HMAC and rejects tampering, length mismatches, and a missing token", () => {
    process.env.QB_WEBHOOK_VERIFIER_TOKEN = token;
    expect(verifyWebhookSignature(body, good)).toBe(true);
    expect(verifyWebhookSignature(body + " ", good)).toBe(false);
    expect(verifyWebhookSignature(body, good.slice(0, -4))).toBe(false);
    expect(verifyWebhookSignature(body, "")).toBe(false);
    delete process.env.QB_WEBHOOK_VERIFIER_TOKEN;
    expect(verifyWebhookSignature(body, good)).toBe(false);
  });
});

describe("getInvoiceWithLink", () => {
  it("always requests include=invoiceLink and returns payUrl only for a trusted link", async () => {
    scriptFetch([json({ Invoice: { Id: "9", DocNumber: "VQ-1", InvoiceLink: "https://connect.intuit.com/pay/9" } })]);
    const inv = await getInvoiceWithLink("9");
    expect(calls[0].url).toContain("/invoice/9?include=invoiceLink");
    expect(inv.payUrl).toBe("https://connect.intuit.com/pay/9");
    scriptFetch([json({ Invoice: { Id: "9", DocNumber: "VQ-1", InvoiceLink: "http://evil.example/9" } })]);
    expect((await getInvoiceWithLink("9")).payUrl).toBeNull();
  });
});

describe("createInvoice", () => {
  it("emits ItemRef and BillAddr when given, sets the deterministic DocNumber, and rounds line amounts", async () => {
    scriptFetch([
      json({ QueryResponse: { Customer: [{ Id: "CUST1", DisplayName: "Jamie" }] } }), // find by email
      json({ Invoice: { Id: "77", DocNumber: "VQ-260907-0001-V1", TotalAmt: 4299.99 } }),
    ]);
    const inv = await createInvoice({
      customerEmail: "jamie@example.com",
      customerName: "Jamie",
      docNumber: "VQ-260907-0001-V1",
      billAddr: { line1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701" },
      lineItems: [
        { description: "VendEra AI Cooler", amount: 3700, quantity: 1, qbItemId: "ITEM-COOLER" },
        { description: "Vending Machine Freight", amount: 500, quantity: 1, qbItemId: "ITEM-FREIGHT" },
        { description: "Coffee Machine Freight", amount: 99.99, quantity: 3, qbItemId: "ITEM-CFREIGHT" },
      ],
    });
    expect(inv.Id).toBe("77");
    const body = calls[1].body as { DocNumber: string; BillAddr: Record<string, string>; Line: Array<{ Amount: number; SalesItemLineDetail: { ItemRef?: { value: string }; Qty: number } }> };
    expect(body.DocNumber).toBe("VQ-260907-0001-V1");
    expect(body.BillAddr.CountrySubDivisionCode).toBe("TX");
    expect(body.Line[0].SalesItemLineDetail.ItemRef).toEqual({ value: "ITEM-COOLER" });
    expect(body.Line[2].Amount).toBe(299.97);
  });

  it("returns the existing invoice on a duplicate DocNumber instead of creating a second one", async () => {
    scriptFetch([
      json({ QueryResponse: { Customer: [{ Id: "CUST1" }] } }),
      json({ Fault: { Error: [{ code: "6140", Message: "Duplicate Document Number Error" }] } }, 400),
      json({ QueryResponse: { Invoice: [{ Id: "77", DocNumber: "VQ-260907-0001-V1" }] } }),
    ]);
    const inv = await createInvoice({ customerEmail: "j@example.com", customerName: "Jamie", docNumber: "VQ-260907-0001-V1", lineItems: [{ description: "x", amount: 1 }] });
    expect(inv.Id).toBe("77");
    expect(calls.filter((c) => c.url.endsWith("/invoice")).length).toBe(1);
  });
});
