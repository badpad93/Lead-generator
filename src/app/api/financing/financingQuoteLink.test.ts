import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

/**
 * POST /api/financing with a Vinnie quote_ref: the application is
 * saved exactly as before and the quote is linked only when the
 * signed-in applicant owns it. The financing form's own fields are
 * never written to the quote. Resend, CRM, workflows, and account
 * provisioning are stubbed; no network.
 */
const store: StubStore = {};
const stub = createSupabaseStub(store, []);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
const auth = { userId: null as string | null };
vi.mock("@/lib/apiAuth", () => ({ getUserIdFromRequest: async () => auth.userId }));
vi.mock("@/lib/confirmationEmail", () => ({ sendFormConfirmationEmails: async () => undefined }));
vi.mock("@/lib/auth/provisionalAccount", () => ({
  provisionAccountForGuestCheckout: async () => ({ userId: "44444444-4444-4444-8444-000000000004" }),
  generateGuestToken: () => "tok",
  guestTokenExpiry: () => new Date("2030-01-01T00:00:00Z"),
}));
const emails: Array<Record<string, unknown>> = [];
vi.mock("resend", () => ({ Resend: class { emails = { send: async (m: Record<string, unknown>) => { emails.push(m); return { data: { id: "em" }, error: null }; } }; } }));
vi.mock("@/lib/salesAccountResolver", () => ({ findOrCreateSalesAccount: async () => ({ id: "acct-1" }) }));
vi.mock("@/lib/workflows/hooks", () => ({ spawnFromFinancingApplication: async () => undefined }));

import { POST } from "./route";
import { signQuoteRef } from "@/lib/commerce/financingLink";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const Q1 = "22222222-2222-4222-8222-000000000001";
const BODY = { full_name: "Jamie Doe", email: "jamie@example.com", phone: "555-0100", agreed_provide_docs: true, agreed_accurate_info: true };
const post = (body: unknown) => POST(new NextRequest("http://localhost/api/financing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.ASSISTANT_HASH_SECRET = "test-secret";
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  for (const k of Object.keys(store)) delete store[k];
  store.financing_applications = [];
  store.sales_leads = [];
  store.guest_checkout_sessions = [];
  store.commerce_quotes = [{ id: Q1, user_id: U1, status: "confirmed", total: 4200, financing_program: "standard", financing_status: "interested", financing_application_id: null }];
  emails.length = 0;
  auth.userId = U1;
});

const quote = () => store.commerce_quotes[0];

describe("POST /api/financing quote linkage", () => {
  it("links the owner's quote to the new application without changing the quote's total or status", async () => {
    const res = await post({ ...BODY, quote_ref: signQuoteRef(Q1) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(store.financing_applications).toHaveLength(1);
    expect(quote().financing_application_id).toBe(json.applicationId);
    expect(quote().financing_status).toBe("application_submitted");
    expect(quote().total).toBe(4200);
    expect(quote().status).toBe("confirmed");
    expect(JSON.stringify(quote())).not.toMatch(/credit|income|citizenship|bankruptcy/i);
  });
  it("saves the application but leaves a stranger's quote untouched", async () => {
    auth.userId = U2;
    const res = await post({ ...BODY, quote_ref: signQuoteRef(Q1) });
    expect(res.status).toBe(200);
    expect(store.financing_applications).toHaveLength(1);
    expect(quote().financing_application_id).toBeNull();
    expect(quote().financing_status).toBe("interested");
  });
  it("ignores a forged reference and a reference from an anonymous applicant", async () => {
    expect((await post({ ...BODY, quote_ref: `${Q1}.forged-signature-value-0000000000000` })).status).toBe(200);
    expect(quote().financing_application_id).toBeNull();
    auth.userId = null;
    expect((await post({ ...BODY, quote_ref: signQuoteRef(Q1) })).status).toBe(200);
    expect(quote().financing_application_id).toBeNull();
    expect(store.financing_applications).toHaveLength(2);
  });
  it("behaves exactly as before when no quote_ref is sent", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    expect(store.financing_applications).toHaveLength(1);
    expect(quote().financing_application_id).toBeNull();
  });
});
