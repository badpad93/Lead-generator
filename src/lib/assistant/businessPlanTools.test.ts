import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "./__testutils__/supabaseStub";

/**
 * The eight business-plan tools through the real dispatcher: guest
 * limits, the write-tools flag, owner scoping, deterministic outputs,
 * website opt-out, idempotent plan → quote, exports, and the financing
 * hand-off. No OpenAI, QuickBooks, or financing backend is contacted.
 */
const store: StubStore = {};
let seq = 0;
const stub = createSupabaseStub(store, [], {
  defaults: {
    commerce_quotes: () => ({ quote_number: `VQ-260910-${String(++seq).padStart(4, "0")}`, status: "draft", currency: "USD", version: 1, confirmed_version: null, confirmed_at: null, expires_at: null, financing_program: null, financing_status: "none", financing_application_id: null, financing_interest_at: null, agreement_state: "not_required", subtotal: 0, tax_status: "pre_tax", total: 0, qb_customer_id: null, qb_invoice_id: null, qb_invoice_doc_number: null, qb_invoice_status: "none", checkout_status: "none", checkout_url: null, checkout_idempotency_key: null, checkout_started_at: null, checkout_completed_at: null, updated_at: new Date().toISOString() }),
    commerce_quote_lines: () => ({ staff_determination_by: null, staff_determination_at: null, staff_determination_note: null }),
    commerce_business_plans: () => ({ plan_number: `VP-260910-${String(++seq).padStart(4, "0")}`, quote_id: null, financing_status: "none", financing_application_id: null, updated_at: new Date(Date.now() + seq).toISOString() }),
  },
});
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({ resolveCoffeeProductsPricing: async () => new Map() }));
vi.mock("@/lib/placementAgreements", () => ({ requireExecutedCoffeeSupplyAgreement: async () => null }));
vi.mock("@/lib/storefront/flags", () => ({ isStorefrontFlagEnabled: async () => false }));

import { dispatchTool, TOOL_OUTPUT_MAX_BYTES } from "./tools/registry";
import type { ToolContext } from "./tools/context";
import { findProhibitedKey } from "./publicShapes";
import type { PlanToolOutput } from "./tools/businessPlanTools";

const U1 = "11111111-1111-4111-8111-000000000001";
const U2 = "11111111-1111-4111-8111-000000000002";
const profile = { id: U1, full_name: "Jamie", role: "operator", coffee_access_enabled: false, storefront_tenant_id: null };
const guest: ToolContext = { threadId: "T", profile: null, storefront: null, writeToolsEnabled: true };
const userNoWrite: ToolContext = { threadId: "T", profile, storefront: null, writeToolsEnabled: false };
const user: ToolContext = { threadId: "T", profile, storefront: null, writeToolsEnabled: true };
const other: ToolContext = { threadId: "T2", profile: { ...profile, id: U2 }, storefront: null, writeToolsEnabled: true };

const item = (n: number, catalog_key: string, name: string, extra: Record<string, unknown>) => ({ id: `c0000000-0000-4000-8000-00000000000${n}`, catalog_key, name, description: null, item_type: "other", sku: null, active: true, commerce_kind: "direct_checkout", pricing_basis: "fixed_unit", tax_treatment: "unset", required_agreement: null, qualification_program: null, financing_program: null, add_on_parent_key: null, equipment_ownership: null, qb_item_id: "SECRET-ITEM", ...extra });
const CATALOG = () => [
  item(1, "vendera-ai-cooler", "VendEra AI Cooler", { unit_price: "3700.00", item_type: "vendera_ai_cooler", commerce_kind: "agreement_required", required_agreement: "machine_purchase", equipment_ownership: "sold" }),
  item(2, "vending-machine-freight", "Vending Machine Freight", { unit_price: "500.00", item_type: "freight", commerce_kind: "conditional_add_on", add_on_parent_key: "vendera-ai-cooler" }),
  item(3, "location-service-10-10-10", "Location Services 10/10/10", { unit_price: "400.00", item_type: "location_services", commerce_kind: "qualification_required", qualification_program: "ten_ten_ten" }),
  item(4, "location-service-tier-1", "Location Services Tier 1", { unit_price: "500.00", item_type: "location_services", commerce_kind: "qualification_required", qualification_program: "location_tier" }),
  item(5, "website-creation", "Website Creation", { unit_price: "500.00" }),
];

const SPEC = { package: null, operator: null, assumptions: null, rollout: null, website_included: null, financing_case: null, cash_contribution: null };
const OPERATOR = { operator_type: "new", business_name: "Sunrise Vending", territory: "Tampa Bay", service_radius_miles: 25, vending_experience: "none", weekly_hours_available: 20, staffing: "owner_operated", has_vehicle: true, has_storage: true, desired_launch: "Q1", monthly_cash_flow_goal: 3000, cash_available: 8000, financing_interest: true, credit_range: null, credit_score: 720, target_machine_count: 10, expected_location_fee_rate: 0, existing_machine_count: null, existing_monthly_sales: null };
const run = (name: Parameters<typeof dispatchTool>[0], input: unknown, ctx: ToolContext) => dispatchTool(name, JSON.stringify(input), ctx);
const planOf = (r: Awaited<ReturnType<typeof dispatchTool>>) => r.output as PlanToolOutput;

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.commerce_quotes = [];
  store.commerce_quote_lines = [];
  store.commerce_business_plans = [];
  store.storefront_tenant_hidden_products = [];
  store.coffee_products = [];
  store.profiles = [{ id: U1, email: "j@example.com", full_name: "Jamie", phone: null, address: null, city: null, state: null, zip: null }, { id: U2, email: "o@example.com", full_name: "Other", phone: null, address: null, city: null, state: null, zip: null }];
  store.catalog_items = CATALOG();
  store.machine_purchase_agreements = [];
});

describe("guests", () => {
  it("get an unsaved educational estimate with live catalog prices and a fixed sign-in path", async () => {
    const r = await run("calculate_vending_business_plan", SPEC, guest);
    expect(r.ok).toBe(true);
    const out = planOf(r);
    expect(out).toMatchObject({ status: "estimate", saved: false, plan_id: null, sign_in_href: "/login?redirect=/assistant" });
    expect(out.notices[0]).toMatch(/Educational estimate only/);
    expect(out.plan.sources_and_uses.total_uses).toBe(56_500);
    expect(out.plan.financing.options.map((o) => o.illustrative.monthly_payment)).toEqual([726.83, 1366.89]);
    expect(store.commerce_business_plans).toEqual([]);
    expect(Buffer.byteLength(JSON.stringify(r.output))).toBeLessThan(TOOL_OUTPUT_MAX_BYTES * 0.75);
  });
  it("cannot save, read, quote, export, or apply", async () => {
    for (const [name, input] of [["start_vending_business_plan", SPEC], ["update_vending_business_plan", { plan_id: null, changes: { ...SPEC, confirmed: null, reset_assumptions: null } }], ["get_vending_business_plan", { plan_id: null }], ["create_quote_from_business_plan", { plan_id: null, confirm: true }], ["get_business_plan_exports", { plan_id: null }], ["start_financing_application", { plan_id: null }]] as const) {
      const r = await run(name, input, guest);
      expect(r, name).toMatchObject({ ok: false, errorCode: "authentication_required", status: "refused" });
    }
    expect(store.commerce_business_plans).toEqual([]);
    expect(store.commerce_quotes).toEqual([]);
  });
});

describe("write-tools flag", () => {
  it("fails closed for saving, quoting, and the financing hand-off while still allowing estimates", async () => {
    for (const [name, input] of [["start_vending_business_plan", SPEC], ["update_vending_business_plan", { plan_id: null, changes: { ...SPEC, confirmed: null, reset_assumptions: null } }], ["create_quote_from_business_plan", { plan_id: null, confirm: true }], ["start_financing_application", { plan_id: null }]] as const) {
      expect(await run(name, input, userNoWrite), name).toMatchObject({ ok: false, errorCode: "write_tools_disabled" });
    }
    expect((await run("calculate_vending_business_plan", SPEC, userNoWrite)).ok).toBe(true);
    expect(store.commerce_business_plans).toEqual([]);
  });
});

describe("saved plans", () => {
  it("start saves version 1 with labelled sources; update recalculates as a new version; reset restores the default", async () => {
    const started = planOf(await run("start_vending_business_plan", { ...SPEC, operator: OPERATOR }, user));
    expect(started).toMatchObject({ status: "saved", saved: true, version: 1, plan_status: "draft" });
    expect(started.plan_number).toMatch(/^VP-/);
    expect(started.missing_discovery).toEqual([]);
    expect(started.plan.recommendation).toMatchObject({ lead: "ten_ten_ten", recommended: "ten_ten_ten", honest_downsell: false });
    const updated = planOf(await run("update_vending_business_plan", { plan_id: started.plan_id, changes: { ...SPEC, assumptions: { ...Object.fromEntries(started.plan.assumptions.map((a) => [a.key, null])), sales_base: 900 }, confirmed: true, reset_assumptions: null } }, user));
    expect(updated.version).toBe(2);
    expect(updated.plan_status).toBe("confirmed");
    expect(updated.plan.assumptions.find((a) => a.key === "sales_base")).toMatchObject({ value: 900, source: "customer" });
    expect(updated.plan.scenarios[1].sales_per_cooler).toBe(900);
    const reset = planOf(await run("update_vending_business_plan", { plan_id: null, changes: { ...SPEC, confirmed: null, reset_assumptions: ["sales_base"] } }, user));
    expect(reset.version).toBe(3);
    expect(reset.plan.assumptions.find((a) => a.key === "sales_base")).toMatchObject({ value: 800, source: "default" });
    expect(store.commerce_business_plans).toHaveLength(1);
    expect(store.commerce_business_plans[0]).toMatchObject({ user_id: U1, version: 3, engine_version: expect.any(String) });
  });

  it("records the website decision explicitly and never drops the website on a downsell", async () => {
    const started = planOf(await run("start_vending_business_plan", SPEC, user));
    expect(started.plan.website).toMatchObject({ included: true, decision: "default", catalog_price: 500 });
    const five = planOf(await run("update_vending_business_plan", { plan_id: started.plan_id, changes: { ...SPEC, package: "five_machine", confirmed: null, reset_assumptions: null } }, user));
    expect(five.plan.package).toBe("five_machine");
    expect(five.plan.website.included).toBe(true);
    const declined = planOf(await run("update_vending_business_plan", { plan_id: started.plan_id, changes: { ...SPEC, website_included: false, confirmed: null, reset_assumptions: null } }, user));
    expect(declined.plan.website).toMatchObject({ included: false, decision: "declined" });
    expect(store.commerce_business_plans[0]).toMatchObject({ website_included: false, website_decision: "declined" });
  });

  it("reads are owner-scoped: another customer's plan id is not found, and latest is per customer", async () => {
    const mine = planOf(await run("start_vending_business_plan", SPEC, user));
    const theirs = await run("get_vending_business_plan", { plan_id: mine.plan_id }, other);
    expect(theirs).toMatchObject({ ok: false, errorCode: "quote_rejected" });
    expect(String((theirs.output as { error: { message: string } }).error.message)).not.toMatch(/VP-/);
    expect(await run("get_vending_business_plan", { plan_id: null }, other)).toMatchObject({ ok: false });
    expect(planOf(await run("get_vending_business_plan", { plan_id: null }, user)).plan_id).toBe(mine.plan_id);
  });

  it("reports an honest downsell when the customer's inputs rule out ten machines", async () => {
    const r = await run("recommend_vending_package", { operator: { ...OPERATOR, weekly_hours_available: 5, target_machine_count: 10 } }, guest);
    const out = r.output as { recommendation: { lead: string; recommended: string; honest_downsell: boolean }; packages: Array<{ package: string }> };
    expect(out.recommendation).toMatchObject({ lead: "ten_ten_ten", recommended: "five_machine", honest_downsell: true });
    expect(out.packages.map((p) => p.package)).toEqual(["ten_ten_ten", "five_machine", "single_machine"]);
  });
});

describe("plan → quote", () => {
  const lines = () => store.commerce_quote_lines as Array<{ catalog_key: string; quantity: number; is_auto_add_on: boolean }>;
  it("previews without writing until confirmed, then builds the quote from the live catalog with freight and no working capital", async () => {
    const plan = planOf(await run("start_vending_business_plan", { ...SPEC, operator: OPERATOR }, user));
    const preview = await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: false }, user);
    expect(preview.output).toMatchObject({ status: "confirmation_required" });
    expect(store.commerce_quotes).toEqual([]);
    const created = await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user);
    expect(created.ok).toBe(true);
    const out = created.output as { status: string; changed: boolean; quote: { quote_id: string; subtotal: number; lines: Array<{ ref: string; quantity: number; is_auto_add_on: boolean; validation_status: string }> }; reconciliation: Record<string, number> };
    expect(out.status).toBe("quote");
    expect(out.changed).toBe(true);
    const byRef = Object.fromEntries(out.quote.lines.map((l) => [l.ref, l]));
    expect(byRef["vendera-ai-cooler"]).toMatchObject({ quantity: 10 });
    expect(byRef["vending-machine-freight"]).toMatchObject({ quantity: 10, is_auto_add_on: true });
    expect(byRef["location-service-10-10-10"]).toMatchObject({ quantity: 10, validation_status: "requires_qualification" });
    expect(byRef["website-creation"]).toMatchObject({ quantity: 1 });
    expect(out.quote.lines.map((l) => l.ref)).not.toContain("working-capital");
    expect(out.quote.subtotal).toBe(46_500);
    expect(out.reconciliation).toMatchObject({ quote_subtotal: 46_500, working_capital_allowance: 10_000, financing_request: 56_500 });
    expect(store.commerce_business_plans[0]).toMatchObject({ quote_id: out.quote.quote_id, status: "quoted" });
    expect(JSON.stringify(created.output)).not.toMatch(/SECRET-ITEM|qb_/);
  });

  it("is idempotent and follows the website decision", async () => {
    const plan = planOf(await run("start_vending_business_plan", SPEC, user));
    const first = (await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user)).output as { quote: { quote_id: string } };
    const second = (await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user)).output as { changed: boolean; quote: { quote_id: string } };
    expect(second.changed).toBe(false);
    expect(second.quote.quote_id).toBe(first.quote.quote_id);
    expect(store.commerce_quotes).toHaveLength(1);
    expect(lines().filter((l) => l.catalog_key === "website-creation")).toHaveLength(1);
    await run("update_vending_business_plan", { plan_id: plan.plan_id, changes: { ...SPEC, website_included: false, confirmed: null, reset_assumptions: null } }, user);
    const third = (await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user)).output as { changed: boolean; quote: { quote_id: string; lines: Array<{ ref: string }> } };
    expect(third.changed).toBe(true);
    expect(third.quote.quote_id).toBe(first.quote.quote_id);
    expect(third.quote.lines.map((l) => l.ref)).not.toContain("website-creation");
  });

  it("never puts a location tier on a five- or one-machine quote", async () => {
    const plan = planOf(await run("start_vending_business_plan", { ...SPEC, package: "five_machine" }, user));
    const out = (await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user)).output as { quote: { lines: Array<{ ref: string; quantity: number }> } };
    const refs = out.quote.lines.map((l) => l.ref);
    expect(refs.filter((r) => r.startsWith("location-service"))).toEqual([]);
    expect(out.quote.lines.find((l) => l.ref === "vendera-ai-cooler")).toMatchObject({ quantity: 5 });
    expect(plan.plan.sources_and_uses.uses.find((u) => u.key === "placements")).toMatchObject({ quotable: false, amount: 2500 });
  });

  it("fails safely when a catalog row is missing instead of inventing it", async () => {
    store.catalog_items = CATALOG().filter((c) => c.catalog_key !== "website-creation");
    const plan = planOf(await run("start_vending_business_plan", SPEC, user));
    expect(plan.plan.catalog_missing).toEqual(["website-creation"]);
    expect(plan.notices.join(" ")).toMatch(/Catalog correction needed/);
    const r = await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user);
    expect(r).toMatchObject({ ok: false, errorCode: "quote_rejected" });
    expect((r.output as { error: { message: string } }).error.message).toMatch(/catalog correction/);
    expect(store.commerce_quotes).toEqual([]);
  });
});

describe("exports and financing hand-off", () => {
  it("returns three server export links for the owner's plan", async () => {
    const plan = planOf(await run("start_vending_business_plan", SPEC, user));
    const out = (await run("get_business_plan_exports", { plan_id: null }, user)).output as { exports: Array<{ format: string; href: string }> };
    expect(out.exports.map((e) => e.format)).toEqual(["xlsx", "docx", "pdf"]);
    for (const e of out.exports) expect(e.href).toBe(`/api/assistant/business-plan/${plan.plan_id}/export?format=${e.format}`);
    expect(await run("get_business_plan_exports", { plan_id: plan.plan_id }, other)).toMatchObject({ ok: false });
  });

  it("hands off to the fixed first-party financing path with signed references only, records the status, and implies no approval", async () => {
    const plan = planOf(await run("start_vending_business_plan", { ...SPEC, operator: OPERATOR }, user));
    const quote = (await run("create_quote_from_business_plan", { plan_id: plan.plan_id, confirm: true }, user)).output as { quote: { quote_id: string } };
    const r = await run("start_financing_application", { plan_id: plan.plan_id }, user);
    expect(r.ok).toBe(true);
    const out = r.output as { href: string; financing_status: string; financing_request: number; notice: string; monthly_payment_estimates: Array<{ monthly_payment: number }> };
    expect(out.href).toMatch(/^\/financing\?plan=[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}&quote=[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
    expect(out.href).toContain(`plan=${plan.plan_id}.`);
    expect(out.href).toContain(`quote=${quote.quote.quote_id}.`);
    expect(out.financing_status).toBe("application_started");
    expect(out.financing_request).toBe(56_500);
    expect(out.notice).toMatch(/not an approval/);
    expect(JSON.stringify(out)).not.toMatch(/approved|income|date_of_birth|ssn/i);
    expect(store.commerce_business_plans[0]).toMatchObject({ financing_status: "application_started" });
    expect(store.commerce_quotes[0]).toMatchObject({ qb_invoice_id: null, checkout_status: "none" });
  });
});

describe("schemas and privacy", () => {
  it("rejects sensitive or price-bearing fields at the schema", async () => {
    for (const extra of [{ ssn: "1" }, { annual_income: 5 }, { date_of_birth: "1990-01-01" }, { bank_account: "1" }, { price: 1 }, { total: 1 }]) {
      const inOperator = await run("calculate_vending_business_plan", { ...SPEC, operator: { ...OPERATOR, ...extra } }, guest);
      expect(inOperator.errorCode, JSON.stringify(extra)).toBe("invalid_arguments");
      const top = await run("calculate_vending_business_plan", { ...SPEC, ...extra }, guest);
      expect(top.errorCode).toBe("invalid_arguments");
    }
    expect((await run("calculate_vending_business_plan", { ...SPEC, operator: { ...OPERATOR, credit_range: "720" } }, guest)).errorCode).toBe("invalid_arguments");
    expect((await run("calculate_vending_business_plan", { ...SPEC, operator: { ...OPERATOR, credit_score: 200 } }, guest)).errorCode).toBe("invalid_arguments");
    const scored = await run("calculate_vending_business_plan", { ...SPEC, operator: { ...OPERATOR, credit_score: 712 } }, guest);
    expect(scored.ok).toBe(true);
    expect(planOf(scored).plan.profile).toMatchObject({ credit_score: 712, credit_range: "700–749" });
    expect((await run("calculate_vending_business_plan", { ...SPEC, assumptions: { ...Object.fromEntries(Object.keys(OPERATOR).map((k) => [k, null])) } }, guest)).errorCode).toBe("invalid_arguments");
  });
  it("every output passes the prohibited-key scan and carries no internal or sensitive keys", async () => {
    const plan = await run("start_vending_business_plan", { ...SPEC, operator: OPERATOR }, user);
    expect(findProhibitedKey(plan.output)).toBeNull();
    const json = JSON.stringify(plan.output);
    expect(json).not.toMatch(/user_id|qb_item|SECRET|tax_treatment|unit_cost/);
    expect(json).toMatch(/illustrative projections/);
  });
});
