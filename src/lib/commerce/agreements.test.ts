import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "@/lib/assistant/__testutils__/supabaseStub";

/**
 * The two agreement gates against stubbed tables, with the real
 * placementAgreements status logic (not mocked here):
 *   coffee_supply    user_agreements keyed by user_id; only fully_executed or
 *                    legacy_approved satisfies, and only the caller's own latest row
 *   machine_purchase purchase_agreements; only agreement_status=signed with
 *                    operator_id = the caller satisfies; email is never ownership
 */
const store: StubStore = {};
const stub = createSupabaseStub(store, []);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

import { coffeeSupplyGate, gateFor, machinePurchaseGate } from "./agreements";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const userAgreement = (extra: Record<string, unknown>) => ({ id: "UA1", user_id: U1, agreement_type: "coffee_supply", agreement_template_id: "T1", agreement_version: 1, status: "fully_executed", created_at: "2026-09-01T00:00:00Z", ...extra });
const purchaseAgreement = (extra: Record<string, unknown>) => ({ id: "PA1", agreement_type: "machine_purchase", agreement_status: "signed", operator_id: U1, operator_email: "jamie@example.com", ...extra });

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.user_agreements = [];
  store.purchase_agreements = [];
});

describe("coffee_supply gate", () => {
  it("is satisfied only by the caller's own fully executed or legacy-approved agreement", async () => {
    store.user_agreements = [userAgreement({})];
    expect((await coffeeSupplyGate(U1)).satisfied).toBe(true);
    store.user_agreements = [userAgreement({ status: "legacy_approved" })];
    expect((await coffeeSupplyGate(U1)).satisfied).toBe(true);
    // Someone else's executed agreement does nothing for U1.
    store.user_agreements = [userAgreement({ user_id: U2 })];
    const r = await coffeeSupplyGate(U1);
    expect(r.satisfied).toBe(false);
    expect(r.href).toBe("/coffee/agreement");
    expect(r.needs_staff_review).toBe(false);
  });

  it("rejects every non-executed state: not started, draft, pending countersign, correction requested, declined, superseded, revoked", async () => {
    for (const status of ["not_started", "draft", "provider_signed_pending_company_countersign", "correction_requested", "declined", "superseded", "revoked"]) {
      store.user_agreements = [userAgreement({ status })];
      const r = await coffeeSupplyGate(U1);
      expect(r.satisfied, status).toBe(false);
      expect(r.message, status).toMatch(/Agreement/);
    }
  });

  it("uses the caller's latest row, so a newer revoked or superseded agreement wins over an older executed one", async () => {
    store.user_agreements = [
      userAgreement({ id: "UA-old", status: "fully_executed", created_at: "2026-08-01T00:00:00Z" }),
      userAgreement({ id: "UA-new", status: "revoked", created_at: "2026-09-01T00:00:00Z" }),
    ];
    expect((await coffeeSupplyGate(U1)).satisfied).toBe(false);
  });
});

describe("machine_purchase gate", () => {
  it("is satisfied only by a signed agreement whose operator_id is the caller", async () => {
    store.purchase_agreements = [purchaseAgreement({})];
    expect(await machinePurchaseGate(U1, "jamie@example.com")).toMatchObject({ satisfied: true, message: null, needs_staff_review: false });
    // The caller's email is irrelevant when the id relationship holds.
    expect((await machinePurchaseGate(U1, "unrelated@example.com")).satisfied).toBe(true);
    expect((await machinePurchaseGate(U1, null)).satisfied).toBe(true);
  });

  it("rejects pending, cancelled, expired and wrong-type rows, and another user's signed row, without revealing that any row exists", async () => {
    for (const row of [
      purchaseAgreement({ agreement_status: "draft" }),
      purchaseAgreement({ agreement_status: "sent" }),
      purchaseAgreement({ agreement_status: "viewed" }),
      purchaseAgreement({ agreement_status: "partially_signed" }),
      purchaseAgreement({ agreement_status: "cancelled" }),
      purchaseAgreement({ agreement_status: "expired" }),
      purchaseAgreement({ agreement_type: "coffee_program" }),
      purchaseAgreement({ operator_id: U2 }),
      purchaseAgreement({ operator_id: U2, operator_email: "jamie@example.com" }),
    ]) {
      store.purchase_agreements = [row];
      const r = await machinePurchaseGate(U1, "jamie@example.com");
      expect(r.satisfied, JSON.stringify(row)).toBe(false);
      expect(r.needs_staff_review, JSON.stringify(row)).toBe(false);
      expect(r.message, JSON.stringify(row)).toBe("A signed machine purchase agreement is required before checkout. The sales team sends it and it must be fully signed first.");
    }
  });

  it("an unlinked signed row matching the caller's own email is never authorisation: it asks for staff review", async () => {
    store.purchase_agreements = [purchaseAgreement({ operator_id: null, operator_email: "Jamie@Example.com" })];
    const r = await machinePurchaseGate(U1, "jamie@example.com");
    expect(r.satisfied).toBe(false);
    expect(r.needs_staff_review).toBe(true);
    // An unlinked row that is not signed does not even reach staff review.
    store.purchase_agreements = [purchaseAgreement({ operator_id: null, agreement_status: "partially_signed" })];
    expect((await machinePurchaseGate(U1, "jamie@example.com")).needs_staff_review).toBe(false);
  });

  it("fails closed when the table cannot be read", async () => {
    store.purchase_agreements = [purchaseAgreement({})];
    const failing = { from: () => { throw new Error("connection reset"); } };
    const mod = await import("@/lib/supabaseAdmin");
    const original = mod.supabaseAdmin.from;
    (mod.supabaseAdmin as { from: unknown }).from = failing.from;
    try {
      const r = await machinePurchaseGate(U1, "jamie@example.com");
      expect(r.satisfied).toBe(false);
      expect(r.message).toMatch(/could not be verified/);
    } finally {
      (mod.supabaseAdmin as { from: unknown }).from = original;
    }
  });

  it("gateFor routes by agreement type", async () => {
    store.purchase_agreements = [purchaseAgreement({})];
    store.user_agreements = [userAgreement({})];
    expect((await gateFor("machine_purchase", U1, null)).agreement).toBe("machine_purchase");
    expect((await gateFor("coffee_supply", U1, null)).agreement).toBe("coffee_supply");
  });
});
