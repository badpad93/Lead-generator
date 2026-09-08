import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

/**
 * Hotfix guard for the restored pre-Phase-2 QuickBooks webhook: the route
 * must not reach into Vinnie commerce tables (which do not exist where the
 * Phase 2 migrations have not been applied), and a handled event is still
 * marked processed exactly once. Error semantics are the pre-Phase-2 ones
 * and are deliberately not re-specified here. No network, no database.
 */
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: () => { throw new Error("unused"); } } }));
vi.mock("@/lib/paymentHandlers", () => ({
  handleLeadPurchaseCompleted: vi.fn(), handleAgreementPaymentCompleted: vi.fn(), handleMachinePurchaseCompleted: vi.fn(), handleCoffeeOrderCompleted: vi.fn(), handleMarketplacePurchaseCompleted: vi.fn(),
}));
vi.mock("@/lib/paymentIngest", () => ({ ingestQbPaymentEvent: vi.fn(async () => undefined) }));
const marked: string[] = [];
vi.mock("@/lib/paymentLedger", () => ({
  recordPaymentEvent: vi.fn(async () => ({ event: { id: "EV1" }, alreadyProcessed: false })),
  markEventProcessed: vi.fn(async (id: string) => { marked.push(id); }),
}));
const connection = { shouldThrow: false };
vi.mock("@/lib/quickbooks", () => ({
  verifyWebhookSignature: () => true,
  getConnection: async () => {
    if (connection.shouldThrow) throw new Error("QBO unreachable");
    return { realm_id: "OTHER-REALM", access_token: "t" };
  },
  getAccountingApiBase: () => "https://sandbox-quickbooks.api.intuit.com",
}));

import { POST } from "./quickbooks/route";

function payload(entity = "Payment") {
  return JSON.stringify({ eventNotifications: [{ realmId: "R1", dataChangeEvent: { entities: [{ name: entity, id: "P1", operation: "Create", lastUpdated: "2026-09-07T00:00:00Z" }] } }] });
}
const post = (body: string) => POST(new NextRequest("https://vendingconnector.com/api/webhooks/quickbooks", { method: "POST", body, headers: { "intuit-signature": "sig" } }));

beforeEach(() => {
  marked.length = 0;
  connection.shouldThrow = false;
});

describe("QuickBooks webhook (restored pre-Phase-2 route)", () => {
  it("never imports or calls Vinnie commerce code", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/webhooks/quickbooks/route.ts"), "utf8");
    expect(src).not.toMatch(/markQuotePaidByInvoice|markVinnieQuotePaid|commerce_quotes|@\/lib\/commerce/);
  });

  it("marks a handled event processed once", async () => {
    // Realm mismatch makes handleQBPayment return early — a completed handler.
    const res = await post(payload());
    expect(res.status).toBe(200);
    expect(marked).toEqual(["EV1"]);
  });
});
