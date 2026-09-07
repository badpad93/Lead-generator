import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canSupersede, SUPERSEDABLE_STATUSES } from "./supersedeGuard";
import {
  buildLineItemsSnapshot,
  agreementTotals,
  type LineItemLike,
} from "@/lib/pricing/lineItems";

/*
 * Phase 5C-a7 — safe agreement reissue / supersession. No DB in this env, so
 * the supersession decision is unit-tested directly and the reissue helper +
 * the sign-route safety guards are asserted as source-level regression guards.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

const REISSUE = "src/lib/agreements/reissue.ts";
const SIGN_GET = "src/app/api/agreements/sign/[token]/route.ts";
const SIGN_INITIALS = "src/app/api/agreements/sign/[token]/initials/route.ts";
const SIGN_SIGN = "src/app/api/agreements/sign/[token]/sign/route.ts";
const APEX_SIGN = "src/app/api/sales/agreements/[id]/apex-sign/route.ts";
const SUPERSEDE_ROUTE = "src/app/api/sales/agreements/[id]/supersede/route.ts";

describe("canSupersede — only unsigned sent/viewed agreements", () => {
  it("allows a viewed, unsigned agreement (#1)", () => {
    expect(canSupersede({ agreement_status: "viewed" }).ok).toBe(true);
  });
  it("allows a sent, unsigned agreement", () => {
    expect(canSupersede({ agreement_status: "sent" }).ok).toBe(true);
  });
  it("blocks a signed agreement (#15)", () => {
    const r = canSupersede({ agreement_status: "signed" });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signed_status:signed");
  });
  it("blocks a partially_signed agreement without a separate process (#16)", () => {
    expect(canSupersede({ agreement_status: "partially_signed" }).ok).toBe(false);
  });
  it("blocks when an operator signature timestamp exists, even if status looks sent", () => {
    expect(canSupersede({ agreement_status: "sent", operator_signed_at: "2026-09-08T00:00:00Z" }).ok).toBe(false);
  });
  it("blocks when an apex countersignature timestamp exists", () => {
    expect(canSupersede({ agreement_status: "viewed", apex_signed_at: "2026-09-08T00:00:00Z" }).ok).toBe(false);
  });
  it("blocks draft/generated/cancelled/expired (not in the sent/viewed window)", () => {
    for (const s of ["draft", "generated", "cancelled", "expired"]) {
      expect(canSupersede({ agreement_status: s }).ok, s).toBe(false);
    }
  });
  it("supersedable window is exactly sent + viewed", () => {
    expect([...SUPERSEDABLE_STATUSES].sort()).toEqual(["sent", "viewed"]);
  });
});

describe("reissue helper — old preserved, new is a fresh draft, no money side-effects", () => {
  const src = read(REISSUE);

  it("cancels the old row STATUS ONLY — never overwrites snapshot/sent_at/viewed_at/signatures", () => {
    // The cancel update touches only these three fields.
    expect(src).toContain('.update({ agreement_status: "cancelled", internal_notes: note, updated_at: stamp })');
    expect(src).not.toContain("line_items_snapshot:");
    expect(src).not.toContain("sent_at:");
    expect(src).not.toContain("viewed_at:");
    expect(src).not.toContain("operator_signed_at:");
    expect(src).not.toContain("apex_signed_at:");
    expect(src).not.toContain("sign_token:");
  });

  it("creates the replacement via canonical upsert and requires a NEW row (idempotent)", () => {
    expect(src).toContain("upsertAgreementForOrder(orderId, userId)");
    expect(src).toContain("if (!result.created)");
    expect(src).toContain("replacement_not_created_live_agreement_exists");
  });

  it("records an audit trail on both old (superseded) and new (created_as_replacement)", () => {
    expect(src).toContain('"superseded"');
    expect(src).toContain('"created_as_replacement"');
  });

  it("only writes purchase_agreements + agreement_activity_log — never sales_orders or invoices", () => {
    // The only tables the helper touches directly. It never reads/writes the
    // orders or invoices tables, so invoice_status, payment_status, the
    // financial spine and Invoice 779 are all structurally out of reach.
    // (upsertAgreementForOrder, which it calls, also only writes
    // purchase_agreements + its activity log.)
    expect(src).not.toContain('from("invoices")');
    expect(src).not.toContain('from("sales_orders")');
    expect(src).not.toContain('from("payments")');
    // No property-write of invoice/payment status columns.
    expect(src).not.toContain("invoice_status:");
    expect(src).not.toContain("payment_status:");
  });

  it("the new draft's sign_token comes from the DB default (helper never sets it)", () => {
    // insertNewAgreement (sync.ts) does not set sign_token, and reissue.ts
    // doesn't either — the UUID default gen_random_uuid() produces a fresh one.
    const sync = read("src/lib/agreements/sync.ts");
    expect(sync).toContain('agreement_status: "draft"');
    expect(sync).not.toContain("sign_token:");
  });
});

describe("sign-flow safety — a cancelled agreement cannot be opened or signed", () => {
  it("token GET blocks cancelled/expired", () => {
    expect(read(SIGN_GET)).toContain('["cancelled", "expired"].includes(agreement.agreement_status)');
  });
  it("initials submit blocks cancelled", () => {
    expect(read(SIGN_INITIALS)).toContain('["cancelled", "expired", "signed"].includes(agreement.agreement_status)');
  });
  it("operator signature submit blocks cancelled", () => {
    expect(read(SIGN_SIGN)).toContain('["cancelled", "expired", "signed"].includes(agreement.agreement_status)');
  });
  it("apex countersignature blocks cancelled", () => {
    expect(read(APEX_SIGN)).toContain('["cancelled", "expired"].includes(agreement.agreement_status)');
  });
});

describe("supersede route — admin-gated, creates an UNSENT replacement", () => {
  const src = read(SUPERSEDE_ROUTE);
  it("requires an elevated role", () => {
    expect(src).toContain("isElevatedRole(user.role)");
  });
  it("delegates to the reissue helper and does not send anything", () => {
    expect(src).toContain("createReplacementAgreementForOrder");
    expect(src).not.toContain("sendInvoiceEmail");
    expect(src).not.toContain("/send");
    expect(src).not.toContain("resend");
  });
});

describe("replacement commercial basis — same $46,099.99 canonical snapshot", () => {
  it("the #108 order snapshot totals to 46,099.99 (prepaid basis preserved)", () => {
    const items: LineItemLike[] = [
      { item_type: "vendera_ai_cooler", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
      { item_type: "location_services", service_name: "Location Services", quantity: 10, unit_price: 400, total_price: 4000 },
      { item_type: "freight", service_name: "Vending Machine Freight", quantity: 10, unit_price: 500, total_price: 5000 },
      { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
      { item_type: "coffee_program", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
      { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
    ];
    const totals = agreementTotals(buildLineItemsSnapshot(items));
    expect(totals.totalDuePriorToProcurement).toBe(46099.99);
    // and the reissued freight is corrected too ($500/machine, not $510)
    expect(totals.freightPerMachine).toBe(500);
  });
});
