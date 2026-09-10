import { describe, it, expect } from "vitest";
import { DEFAULT_ASSUMPTIONS } from "./assumptions";
import { LADDER, nextDownsell, PACKAGES, recommendPackage, sourcesAndUses, type PlanCatalog } from "./packages";
import { CATALOG } from "./__testutils__/catalogFixture";
import { buildPlanView, defaultInputs, projectAll } from "./plan";
import { EMPTY_PROFILE, mergeProfile, missingDiscovery, operatorProfileSchema } from "./profile";
import { buildSections, SECTION_TITLES } from "./sections";

describe("offer ladder", () => {
  it("is ordered 10/10/10 → five → one and downsells one rung at a time", () => {
    expect(LADDER).toEqual(["ten_ten_ten", "five_machine", "single_machine"]);
    expect(nextDownsell("ten_ten_ten")).toBe("five_machine");
    expect(nextDownsell("five_machine")).toBe("single_machine");
    expect(nextDownsell("single_machine")).toBeNull();
    expect(PACKAGES.ten_ten_ten).toMatchObject({ machines: 10, estimate_total: 55_000, estimate_working_capital: 10_000 });
    expect(PACKAGES.five_machine).toMatchObject({ machines: 5, estimate_total: 30_000, estimate_working_capital: 5_000 });
    expect(PACKAGES.single_machine).toMatchObject({ machines: 1, estimate_total: 7_000, estimate_working_capital: 1_000 });
  });

  it("always leads with 10/10/10 and recommends it when nothing rules it out", () => {
    const r = recommendPackage({ ...EMPTY_PROFILE, weekly_hours_available: 20, cash_available: 8000, financing_interest: true, has_vehicle: true, has_storage: true });
    expect(r.lead).toBe("ten_ten_ten");
    expect(r.recommended).toBe("ten_ten_ten");
    expect(r.honest_downsell).toBe(false);
    expect(r.ladder.map((l) => l.package)).toEqual(LADDER);
  });

  it("downsells honestly to five when hours or capital rule out ten, and to one when they rule out five", () => {
    const five = recommendPackage({ ...EMPTY_PROFILE, weekly_hours_available: 6, financing_interest: true, cash_available: 6000 });
    expect(five.recommended).toBe("five_machine");
    expect(five.honest_downsell).toBe(true);
    expect(five.ladder[0].reasons[0]).toMatch(/hours a week/);
    const one = recommendPackage({ ...EMPTY_PROFILE, financing_interest: false, cash_available: 8000 });
    expect(one.recommended).toBe("single_machine");
    expect(one.ladder[1].reasons[0]).toMatch(/Without financing/);
    const target = recommendPackage({ ...EMPTY_PROFILE, target_machine_count: 3 });
    expect(target.recommended).toBe("single_machine");
  });
});

describe("sources and uses", () => {
  const a = DEFAULT_ASSUMPTIONS;
  it("10/10/10 uses live catalog prices, 10/10/10 placements, the website, and a working-capital allowance that is never quotable", () => {
    const su = sourcesAndUses({ pkg: PACKAGES.ten_ten_ten, machines: 10, catalog: CATALOG, a, website_included: true, owner_cash: 0 });
    const by = Object.fromEntries(su.uses.map((u) => [u.key, u]));
    expect(by.machines.amount).toBe(37_000);
    expect(by.freight.amount).toBe(5_000);
    expect(by.placements).toMatchObject({ amount: 4_000, quotable: true });
    expect(by.website).toMatchObject({ amount: 500, quotable: true });
    expect(by.opening_inventory).toMatchObject({ amount: 5_000, quotable: false });
    expect(by.working_capital_reserve).toMatchObject({ amount: 5_000, quotable: false });
    expect(su.quotable_subtotal).toBe(46_500);
    expect(su.working_capital_allowance).toBe(10_000);
    expect(su.total_uses).toBe(56_500);
    expect(su.financing_request).toBe(56_500);
  });
  it("five- and one-machine packages show a location allowance at the Tier 1 rate that is not quotable (no invented tier)", () => {
    const su = sourcesAndUses({ pkg: PACKAGES.five_machine, machines: 5, catalog: CATALOG, a, website_included: true, owner_cash: 2_000 });
    const placements = su.uses.find((u) => u.key === "placements")!;
    expect(placements).toMatchObject({ amount: 2_500, quotable: false });
    expect(placements.label).toMatch(/allowance/);
    expect(su.placement_note).toMatch(/location team/);
    expect(su.quotable_subtotal).toBe(5 * 3700 + 5 * 500 + 500);
    expect(su.owner_cash).toBe(2_000);
    expect(su.financing_request).toBe(su.total_uses - 2_000);
  });
  it("a declined website is recorded and priced at zero without being dropped from the table", () => {
    const su = sourcesAndUses({ pkg: PACKAGES.single_machine, machines: 1, catalog: CATALOG, a, website_included: false, owner_cash: 0 });
    const site = su.uses.find((u) => u.key === "website")!;
    expect(site).toMatchObject({ quantity: 0, amount: 0, note: "Declined by the customer." });
    expect(su.website_included).toBe(false);
  });
  it("owner cash never exceeds total uses", () => {
    const su = sourcesAndUses({ pkg: PACKAGES.single_machine, machines: 1, catalog: CATALOG, a, website_included: true, owner_cash: 1_000_000 });
    expect(su.owner_cash).toBe(su.total_uses);
    expect(su.financing_request).toBe(0);
  });
  it("a missing catalog row prices at zero and is reported, never invented", () => {
    const missing: PlanCatalog = { ...CATALOG, website: null, missing: ["website-creation"] };
    const view = buildPlanView(defaultInputs(), missing);
    expect(view.catalog_missing).toEqual(["website-creation"]);
    expect(view.website).toMatchObject({ included: true, available: false, catalog_price: null });
    expect(view.sources_and_uses.uses.find((u) => u.key === "website")).toMatchObject({ amount: 0, quotable: false });
  });
});

describe("canonical plan view", () => {
  it("labels every assumption by source and stamps the engine version", () => {
    const inputs = { ...defaultInputs(), assumptions: { sales_base: 900 } };
    const view = buildPlanView(inputs, CATALOG);
    expect(view.engine_version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(view.assumptions.find((x) => x.key === "sales_base")).toMatchObject({ value: 900, source: "customer" });
    expect(view.assumptions.find((x) => x.key === "cogs_rate")).toMatchObject({ value: 0.45, source: "default", format: "percent" });
    expect(view.rollout.source).toBe("default");
    expect(view.scenarios.map((s) => s.scenario)).toEqual(["conservative", "base", "growth"]);
    expect(view.scenarios.map((s) => s.sales_per_cooler)).toEqual([600, 900, 1000]);
    expect(view.timeline).toHaveLength(12);
    expect(view.financing.options.map((o) => o.illustrative.monthly_payment)).toEqual([726.83, 1366.89]);
    expect(view.disclaimers.join(" ")).toMatch(/not guaranteed income/);
  });
  it("uses the same engine for the compact view and the full projections", () => {
    const inputs = defaultInputs("five_machine");
    const view = buildPlanView(inputs, CATALOG);
    const full = projectAll(inputs, CATALOG);
    const base = full.projections.find((p) => p.scenario === "base")!;
    expect(view.scenarios[1].year1.contribution).toBe(base.year1.contribution);
    expect(view.timeline.map((t) => t.cumulative_cash)).toEqual(base.months.map((m) => m.cumulative_cash));
    expect(view.financing.monthly_debt_service).toBe(full.monthly_debt_service);
  });
  it("never contains guaranteed-income language or internal cost keys", () => {
    const json = JSON.stringify(buildPlanView(defaultInputs(), CATALOG));
    expect(json).toMatch(/not guaranteed income/);
    expect(json).not.toMatch(/is guaranteed|guaranteed (monthly )?(income|profit) of|you will (earn|make)/i);
    expect(json).not.toMatch(/qb_|quickbooks|unit_cost|wholesale|supplier/i);
  });
});

describe("sections", () => {
  it("produces the 21 approved sections in order from the view alone", () => {
    const view = buildPlanView({ ...defaultInputs(), profile: mergeProfile(EMPTY_PROFILE, { business_name: "Sunrise Vending", territory: "Tampa Bay" }) }, CATALOG);
    const sections = buildSections(view, { quote: null, financing_status: "none" });
    expect(sections.map((s) => s.title)).toEqual([...SECTION_TITLES]);
    expect(sections).toHaveLength(21);
    expect(sections[0].paragraphs[0]).toMatch(/Sunrise Vending/);
    expect(sections[1].paragraphs.join(" ")).toMatch(/Tampa Bay/);
    expect(sections[1].paragraphs.join(" ")).toMatch(/not yet provided/);
    expect(sections[19].paragraphs[0]).toMatch(/No quote has been created yet/);
    expect(sections[20].paragraphs.join(" ")).toMatch(/lender/);
    expect(sections.flatMap((s) => s.paragraphs).join(" ")).not.toMatch(/is guaranteed|guaranteed (monthly )?(income|profit) of|you will (earn|make)|approved for/i);
  });
  it("reflects a created quote and a submitted application without implying approval", () => {
    const view = buildPlanView(defaultInputs(), CATALOG);
    const sections = buildSections(view, { quote: { quote_number: "VQ-1", subtotal: 46_500, line_count: 4, status: "draft" }, financing_status: "application_submitted" });
    expect(sections[19].paragraphs[0]).toMatch(/VQ-1/);
    expect(sections[20].paragraphs[1]).toMatch(/submitted/);
    expect(sections[20].paragraphs.join(" ")).not.toMatch(/approved/i);
  });
});

describe("discovery profile", () => {
  it("accepts only the safe fields and the financing form's credit ranges", () => {
    expect(operatorProfileSchema.safeParse({ ...EMPTY_PROFILE, credit_range: "700–749" }).success).toBe(true);
    expect(operatorProfileSchema.safeParse({ ...EMPTY_PROFILE, credit_range: "720" }).success).toBe(false);
    for (const extra of [{ ssn: "1" }, { date_of_birth: "1990-01-01" }, { annual_income: 5 }, { bank_account: "1" }, { card_number: "4" }]) {
      expect(operatorProfileSchema.safeParse({ ...EMPTY_PROFILE, ...extra }).success).toBe(false);
    }
  });
  it("merges answers without erasing earlier ones and lists what is still missing", () => {
    const p = mergeProfile(EMPTY_PROFILE, { operator_type: "new", weekly_hours_available: 10 });
    const q = mergeProfile(p, { operator_type: null, has_vehicle: true });
    expect(q.operator_type).toBe("new");
    expect(q.has_vehicle).toBe(true);
    expect(missingDiscovery(q)).not.toContain("operator_type");
    expect(missingDiscovery(mergeProfile(q, { operator_type: "existing" }))).toContain("existing_machine_count");
  });
});
