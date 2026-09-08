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

  it("corrects the order's DERIVED state only — never invoice_status/payment_status/total_value (Defect 2)", () => {
    // The order update sets exactly these four derived fields.
    expect(src).toContain('order_status: "draft"');
    expect(src).toContain('agreement_status: "not_sent"');
    expect(src).toContain("next_required_action:");
    // Money/invoice columns are preserved — never written.
    expect(src).not.toContain("invoice_status:");
    expect(src).not.toContain("payment_status:");
    expect(src).not.toContain("total_value:");
  });

  it("never mutates order_items, invoices, or payments (Defects 4 + no-invoice)", () => {
    // Reissue only READS sales_orders/invoices (evidence) and WRITES
    // purchase_agreements + sales_orders derived state + activity logs. It
    // never inserts/updates order_items (so it cannot have added the Website
    // Creation line) and never writes invoices/payments.
    expect(src).not.toContain('from("order_items")');
    expect(src).not.toMatch(/from\("invoices"\)[\s\S]{0,80}\.(insert|update|upsert|delete)/);
    expect(src).not.toContain('from("payments")');
  });

  it("clears auto_send_invoice_on_signing when the order is already invoiced (Defect 3), keeping the guard", () => {
    expect(src).toContain("orderAlreadyInvoiced");
    expect(src).toContain("invoiceAlreadyExists");
    expect(src).toContain("auto_send_invoice_on_signing: false");
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

describe("Defect 1 — production-shaped freight (item_type='other') resolves correctly", () => {
  it("vending freight item_type='other' → $5,000 / $500-per-machine; coffee $99.99 separate; total $46,599.99", () => {
    // EXACT current live Order #108 shape (incl. the added Website Creation line).
    const items: LineItemLike[] = [
      { item_type: "vendera_ai_cooler", service_name: "VendEra AI Cooler", quantity: 10, unit_price: 3700, total_price: 37000 },
      { item_type: "location_services", service_name: "Location Services 10/10/10", quantity: 10, unit_price: 400, total_price: 4000 },
      // Vending freight: category resolves to freight BY NAME, item_type is "other".
      { item_type: "other", service_name: "Vending Machine Freight", description: "Freight for machine shipping", quantity: 10, unit_price: 500, total_price: 5000 },
      { item_type: "coffee_program", service_name: "Flavia C600 Brewer", quantity: 1, unit_price: 0, total_price: 0 },
      { item_type: "coffee_program", service_name: "Coffee Machine Freight", quantity: 1, unit_price: 99.99, total_price: 99.99 },
      { item_type: "financing", service_name: "10/10/10 Financing", quantity: 1, unit_price: 0, total_price: 0 },
      { item_type: "other", service_name: "Website Creation", quantity: 1, unit_price: 500, total_price: 500 },
    ];
    const snapshot = buildLineItemsSnapshot(items);
    const totals = agreementTotals(snapshot);

    const vf = snapshot.find((l) => l.service_name === "Vending Machine Freight");
    expect(vf?.category).toBe("freight");
    expect(vf?.item_type).toBe("other"); // the shape that used to yield $0

    expect(totals.freightTotal).toBe(5000);
    expect(totals.freightPerMachine).toBe(500);
    expect(totals.freightPerMachine).not.toBe(510);
    expect(totals.freightPerMachine).not.toBe(0);

    const cf = snapshot.find((l) => l.service_name === "Coffee Machine Freight");
    expect(cf?.category).toBe("freight");
    expect(cf?.total_price).toBe(99.99); // separate, excluded from vending rate

    const web = snapshot.find((l) => l.service_name === "Website Creation");
    expect(web?.category).toBe("other"); // not freight

    // grand total includes both freight lines + the website line
    expect(totals.totalDuePriorToProcurement).toBe(46599.99);
  });
});
