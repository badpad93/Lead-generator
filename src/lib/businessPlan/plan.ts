import { DEFAULT_ROLLOUT, ENGINE_VERSION, FINANCING_CASES, labelAssumptions, resolveAssumptions, SCENARIO_KEYS, type AssumptionOverrides, type FinancingCase, type LabelledAssumption, type PackageKey, type RolloutAssumptions, type ScenarioKey } from "./assumptions";
import { amortizedPayment, deploymentMonths, round2, type BreakEven, type FleetMonth } from "./engine";
import { PACKAGES, recommendPackage, sourcesAndUses, type PackageRecommendation, type PlanCatalog, type SourcesAndUses } from "./packages";
import { EMPTY_PROFILE, type OperatorProfile } from "./profile";
import { debtComparison, projectScenario, type DebtOption, type ScenarioProjection } from "./projection";

/**
 * The canonical plan: customer-confirmed inputs in, one deterministic view
 * out. The stored record keeps the inputs, the catalog snapshot, the
 * engine version, and the compact view; exports recompute the full
 * projections from the same inputs with the same engine.
 */
export type WebsiteDecision = "default" | "accepted" | "declined";

export interface PlanInputs {
  profile: OperatorProfile;
  package: PackageKey;
  assumptions: AssumptionOverrides;
  rollout: RolloutAssumptions;
  website_included: boolean;
  website_decision: WebsiteDecision;
  financing_case: FinancingCase["key"];
  /** Cash the customer will contribute toward the uses of funds (reduces the financing request). */
  owner_cash: number;
  /** Inputs the customer has confirmed as the basis for the final plan. */
  confirmed: boolean;
}

export function defaultInputs(pkg: PackageKey = "ten_ten_ten"): PlanInputs {
  return { profile: { ...EMPTY_PROFILE }, package: pkg, assumptions: {}, rollout: { ...DEFAULT_ROLLOUT, ramp: [...DEFAULT_ROLLOUT.ramp] as [number, number, number] }, website_included: true, website_decision: "default", financing_case: "sba", owner_cash: 0, confirmed: false };
}

export interface ScenarioSummary {
  scenario: ScenarioKey;
  sales_per_cooler: number;
  per_cooler_month: FleetMonth;
  stabilized_month: FleetMonth;
  year1: { sales: number; contribution: number; debt_service: number; net_after_debt_service: number };
  stabilized_year: { sales: number; contribution: number; debt_service: number; net_after_debt_service: number };
  break_even: BreakEven;
  cash_low_point_month: number | null;
  cash_low_point: number;
}

export interface TimelineRow {
  month: number;
  deployed_this_month: number;
  machines_active: number;
  sales: number;
  contribution: number;
  debt_service: number;
  opening_inventory_outlay: number;
  net_cash_flow: number;
  cumulative_cash: number;
}

export interface PlanView {
  engine_version: string;
  package: PackageKey;
  package_name: string;
  machines: number;
  baseline: { machines: number; monthly_sales: number };
  profile: OperatorProfile;
  confirmed: boolean;
  assumptions: LabelledAssumption[];
  rollout: RolloutAssumptions & { deployment_months: number; source: "customer" | "default" };
  website: { included: boolean; decision: WebsiteDecision; catalog_price: number | null; available: boolean };
  catalog_missing: string[];
  sources_and_uses: SourcesAndUses;
  financing: { selected_case: FinancingCase["key"]; monthly_debt_service: number; options: DebtOption[]; lender_note: string };
  scenarios: ScenarioSummary[];
  timeline: TimelineRow[];
  recommendation: PackageRecommendation;
  disclaimers: string[];
}

export const DISCLAIMERS = [
  "All figures are illustrative projections from the stated assumptions, not guaranteed income or a forecast of your results.",
  "Machine contribution is before company overhead, taxes, owner compensation, and debt service; it is not net profit.",
  "Financing rates, terms, eligibility, and approval are controlled by the lender. Nothing here is an offer or an approval.",
  "The business plan uses planning estimates; the final quote uses current catalog prices and classifications.",
];

export const LENDER_NOTE = "Payments are before lender fees. Rates, terms, eligibility, and approval are decided by the lender, never by Vending Connector or this assistant.";

function baselineOf(p: OperatorProfile): PlanView["baseline"] {
  const machines = p.operator_type === "existing" ? (p.existing_machine_count ?? 0) : 0;
  const sales = machines > 0 ? (p.existing_monthly_sales ?? 0) : 0;
  return { machines, monthly_sales: round2(sales) };
}

function summarise(p: ScenarioProjection): ScenarioSummary {
  const y2 = p.years_2_to_5[0];
  return {
    scenario: p.scenario,
    sales_per_cooler: p.sales_per_cooler,
    per_cooler_month: p.per_cooler_month,
    stabilized_month: p.stabilized_month,
    year1: { sales: p.year1.sales, contribution: p.year1.contribution, debt_service: p.year1.debt_service, net_after_debt_service: p.year1.net_after_debt_service },
    stabilized_year: { sales: y2.sales, contribution: y2.contribution, debt_service: y2.debt_service, net_after_debt_service: y2.net_after_debt_service },
    break_even: p.break_even,
    cash_low_point_month: p.cash_low_point_month,
    cash_low_point: p.cash_low_point,
  };
}

function isDefaultRollout(r: RolloutAssumptions): boolean {
  return r.machines_per_month === DEFAULT_ROLLOUT.machines_per_month && r.ramp.every((v, i) => v === DEFAULT_ROLLOUT.ramp[i]);
}

/** Full per-scenario projections (used by exports; the view keeps a compact summary). */
export function projectAll(inputs: PlanInputs, catalog: PlanCatalog): { projections: ScenarioProjection[]; sources_and_uses: SourcesAndUses; monthly_debt_service: number } {
  const pkg = PACKAGES[inputs.package];
  const { values: a } = resolveAssumptions(inputs.assumptions);
  const su = sourcesAndUses({ pkg, machines: pkg.machines, catalog, a, website_included: inputs.website_included, owner_cash: inputs.owner_cash });
  const fc = FINANCING_CASES.find((c) => c.key === inputs.financing_case) ?? FINANCING_CASES[0];
  const payment = amortizedPayment(su.financing_request, fc.annual_rate, fc.term_years);
  const baseline = baselineOf(inputs.profile);
  const sales: Record<ScenarioKey, number> = { conservative: a.sales_conservative, base: a.sales_base, growth: a.sales_growth };
  const projections = SCENARIO_KEYS.map((scenario) => projectScenario({ scenario, sales_per_cooler: sales[scenario], new_machines: pkg.machines, baseline, a, rollout: inputs.rollout, monthly_debt_service: payment, starting_cash: su.working_capital_allowance }));
  return { projections, sources_and_uses: su, monthly_debt_service: payment };
}

export function buildPlanView(inputs: PlanInputs, catalog: PlanCatalog): PlanView {
  const pkg = PACKAGES[inputs.package];
  const { values, sources } = resolveAssumptions(inputs.assumptions);
  const { projections, sources_and_uses, monthly_debt_service } = projectAll(inputs, catalog);
  const base = projections.find((p) => p.scenario === "base") ?? projections[0];
  const timeline: TimelineRow[] = base.months.map((m) => ({ month: m.month, deployed_this_month: m.deployed_this_month, machines_active: m.machines_active, sales: m.sales, contribution: m.contribution, debt_service: m.debt_service, opening_inventory_outlay: m.opening_inventory_outlay, net_cash_flow: m.net_cash_flow, cumulative_cash: m.cumulative_cash }));
  return {
    engine_version: ENGINE_VERSION,
    package: pkg.key,
    package_name: pkg.name,
    machines: pkg.machines,
    baseline: baselineOf(inputs.profile),
    profile: inputs.profile,
    confirmed: inputs.confirmed,
    assumptions: labelAssumptions(values, sources),
    rollout: { ...inputs.rollout, deployment_months: deploymentMonths(pkg.machines, inputs.rollout), source: isDefaultRollout(inputs.rollout) ? "default" : "customer" },
    website: { included: inputs.website_included, decision: inputs.website_decision, catalog_price: catalog.website?.unit_price ?? null, available: catalog.website !== null },
    catalog_missing: catalog.missing,
    sources_and_uses,
    financing: { selected_case: inputs.financing_case, monthly_debt_service, options: debtComparison(sources_and_uses.financing_request, base.years_2_to_5[0].contribution), lender_note: LENDER_NOTE },
    scenarios: projections.map(summarise),
    timeline,
    recommendation: recommendPackage(inputs.profile),
    disclaimers: DISCLAIMERS,
  };
}
