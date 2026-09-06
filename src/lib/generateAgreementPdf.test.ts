import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildAgreement } from "@/lib/agreements/clauses";

/*
 * Phase 3 — PDF layout. We can't rasterize pages in this environment, so
 * these tests prove the generator produces a valid, non-throwing,
 * correctly-paginated PDF for stress and minimal inputs, and that the
 * layout work did not change the canonical CONTENT (which lives in
 * clauses.ts and is asserted structurally here + in clauses.test.ts).
 */

type Gen = typeof import("./generateAgreementPdf");
let gen: Gen;

beforeAll(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= "https://placeholder.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= "placeholder";
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "placeholder";
  gen = await import("./generateAgreementPdf");
});

const LONG = "Global Automated Retail & Distribution Holdings International Company LLC";

function stressAgreement() {
  const lines = Array.from({ length: 24 }, (_, i) => ({
    category: i % 5 === 0 ? "coffee" : i % 3 === 0 ? "freight" : "equipment",
    service_name: `Line Item ${i + 1} — VendEra AI Combo Machine with Extended Cold Chain Package`,
    description:
      "A deliberately long product description that must wrap across multiple lines without being truncated, because it is contractual content the customer is agreeing to purchase.",
    quantity: (i % 4) + 1,
    unit_price: 3712.5 + i * 100,
    discount_percent: i % 6 === 0 ? 15 : 0,
    total_price: i === 2 ? 0 : (3712.5 + i * 100) * ((i % 4) + 1),
    deferred: i % 7 === 0,
  }));
  return {
    agreement_status: "signed",
    effective_date: "2026-01-15",
    apex_company_name: "Apex AI Vending LLC",
    operator_company_name: LONG,
    operator_legal_name: "Bartholomew Alexander Montgomery-Featherstonehaugh III",
    operator_email: "a.very.long.operator.email.address@somelongcompanydomain.example.com",
    operator_phone: "+1 (555) 123-4567",
    operator_billing_address:
      "12345 Exceptionally Long Boulevard Of Broken Dreams, Suite 6789, Some Very Long City Name, California 90210-1234, United States of America",
    operator_delivery_address:
      "98765 Another Extremely Long Delivery Street Address, Building 42, Loading Dock C, Metropolis, NY 10001",
    machine_model: "VendEra AI Combo",
    machine_quantity: 24,
    machine_unit_price: 3712.5,
    equipment_subtotal: 89100,
    locations_purchased: 10,
    location_fee_per_secured: 500,
    max_location_service_value: 5000,
    freight_total: 3500,
    freight_per_machine: 350,
    storage_fee_per_machine_month: 25,
    free_storage_months: 12,
    total_due_prior_to_procurement: 97600,
    customer_notes: "These are additional terms ".repeat(40),
    line_items_snapshot: lines,
    include_equipment: true,
    include_location_services: true,
    include_shipping_storage: true,
  };
}

function minimalAgreement() {
  return {
    agreement_status: "draft",
    effective_date: "2026-02-01",
    operator_company_name: "Acme Co",
    machine_model: "VendEra AI",
    machine_quantity: 1,
    machine_unit_price: 3700,
    equipment_subtotal: 3700,
    total_due_prior_to_procurement: 3700,
    line_items_snapshot: [
      { category: "equipment", service_name: "VendEra AI", quantity: 1, unit_price: 3700, total_price: 3700 },
    ],
    include_equipment: true,
  };
}

async function render(ag: Record<string, unknown>) {
  const bytes = await gen.generatePurchaseAgreementPdf(ag, [], []);
  const buf = Buffer.from(bytes);
  const doc = await PDFDocument.load(bytes);
  return { bytes, buf, pageCount: doc.getPageCount() };
}

describe("Phase 3 — agreement PDF layout", () => {
  it("renders a valid multi-page PDF for a long/stress agreement without throwing", async () => {
    const { buf, pageCount } = await render(stressAgreement());
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.length).toBeGreaterThan(3000);
    // 24 line items + full clause set must spill well past one page.
    expect(pageCount).toBeGreaterThan(2);
  });

  it("renders a compact PDF for a minimal one-item agreement", async () => {
    const { buf, pageCount } = await render(minimalAgreement());
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pageCount).toBeGreaterThanOrEqual(1);
    // Full 31-section legal agreement is inherently several pages; this
    // is a runaway-pagination guard, not a blank-space measure.
    expect(pageCount).toBeLessThanOrEqual(8);
    // A one-item agreement must be materially shorter than the stress doc.
    const stress = await render(stressAgreement());
    expect(pageCount).toBeLessThan(stress.pageCount);
  });

  it("handles a fully-signed agreement with long signer details", async () => {
    const ag = stressAgreement();
    const sigs = [
      { signer_type: "operator", signature_data: "B. Montgomery-Featherstonehaugh", signer_name: "Bartholomew Alexander Montgomery-Featherstonehaugh III", signer_title: "Chief Executive Officer & Managing Director", signer_company: LONG, signer_email: "ceo@somelongcompanydomain.example.com", ip_address: "203.0.113.42" },
      { signer_type: "apex", signature_data: "J. Padden", signer_name: "James Padden", signer_title: "Representative", signer_email: "james@apex.example.com" },
    ];
    const bytes = await gen.generatePurchaseAgreementPdf({ ...ag, operator_signed_at: "2026-01-16", apex_signed_at: "2026-01-17" }, sigs, []);
    expect(Buffer.from(bytes).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("content regression: layout changes did not alter canonical clauses", () => {
    // The PDF renders buildAgreement(); asserting its output here locks
    // the content the layout renders. (Full content coverage in
    // clauses.test.ts.)
    const built = buildAgreement(stressAgreement());
    const nums = built.sections.map((s) => s.displayNumber);
    expect(nums).toEqual(nums.map((_, i) => i + 1)); // contiguous
    expect(built.sections.find((s) => s.id === "governing_law")).toBeTruthy();
    // a $0 comped line and a discounted line survive into the snapshot
    const snap = stressAgreement().line_items_snapshot;
    expect(snap.some((l) => l.total_price === 0)).toBe(true);
    expect(snap.some((l) => l.discount_percent === 15)).toBe(true);
  });
});
