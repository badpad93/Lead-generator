import { FINANCING_CASES } from "../assumptions";
import type { FleetMonth } from "../engine";
import { catalogFromSnapshot } from "../packages";
import { projectAll, type PlanView } from "../plan";
import type { MonthRow, ScenarioProjection, YearRow } from "../projection";
import { buildSections, pct, usd, type PlanSection, type SectionContext } from "../sections";
import type { PlanRow } from "../store";

/**
 * Format-agnostic export model. Every export (xlsx, docx, pdf) renders
 * this one structure, which is derived from the stored plan inputs by the
 * same engine that produced the chat view. Nothing here comes from
 * anywhere else, so the three files and the chat always agree.
 */
export interface DocTable {
  key: string;
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  /** Column indexes formatted as currency in spreadsheets. */
  money_columns: number[];
  note?: string;
}

export interface PlanDocument {
  title: string;
  subtitle: string;
  plan_number: string;
  version: number;
  engine_version: string;
  generated_at: string;
  business_name: string;
  package_name: string;
  view: PlanView;
  sections: PlanSection[];
  tables: DocTable[];
  projections: ScenarioProjection[];
  monthly_debt_service: number;
  disclaimers: string[];
}

export const BRAND = { name: "Vending Connector", tagline: "Vinnie business plan", site: "vendingconnector.com", green: "16A34A", black: "111111", gray: "6B7280" } as const;

export const PL_LINES: Array<{ key: keyof FleetMonth; label: string }> = [
  { key: "sales", label: "Sales" },
  { key: "cogs", label: "Product cost (COGS)" },
  { key: "gross_profit", label: "Gross margin" },
  { key: "vms", label: "VMS" },
  { key: "processing", label: "Percentage processing" },
  { key: "debit_fees", label: "Debit transaction fees" },
  { key: "shrink", label: "Shrink" },
  { key: "repair_reserve", label: "Repair reserve" },
  { key: "restocking", label: "Restocking labor and fuel" },
  { key: "pre_fee_contribution", label: "Pre-commission machine contribution" },
  { key: "location_fee", label: "Location commission" },
  { key: "contribution", label: "Machine contribution" },
  { key: "contribution_after_stress", label: "Contribution under 10% commission stress" },
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

function assumptionsTable(v: PlanView): DocTable {
  return { key: "assumptions", title: "Assumptions", columns: ["Assumption", "Value", "Source"], rows: v.assumptions.map((a) => [a.label, a.format === "percent" ? pct(a.value) : usd(a.value), a.source === "customer" ? "Customer-supplied" : "Vending Connector default"]), money_columns: [] };
}

function perCoolerTable(v: PlanView): DocTable {
  return { key: "per_cooler", title: "Per-machine unit economics (one stabilized cooler, per month)", columns: ["Line", ...v.scenarios.map((s) => `${cap(s.scenario)} (${usd(s.sales_per_cooler)})`)], rows: PL_LINES.map((l) => [l.label, ...v.scenarios.map((s) => s.per_cooler_month[l.key])]), money_columns: [1, 2, 3], note: "Machine contribution is before company overhead, taxes, owner compensation, and debt service." };
}

function sourcesUsesTable(v: PlanView): DocTable {
  const su = v.sources_and_uses;
  const rows: Array<Array<string | number>> = su.uses.map((u) => [u.label, u.quantity, u.unit_amount, u.amount, u.quotable ? "Quote line" : "Financing request only"]);
  rows.push(["Total uses", "", "", su.total_uses, ""], ["Owner cash", "", "", su.owner_cash, "Source"], ["Financing request", "", "", su.financing_request, "Source"]);
  return { key: "sources_uses", title: "Sources and uses of funds", columns: ["Use", "Qty", "Unit", "Amount", "Treatment"], rows, money_columns: [2, 3], note: su.placement_note };
}

function scenarioTable(v: PlanView): DocTable {
  const rows: Array<Array<string | number>> = [
    ["Monthly sales per cooler", ...v.scenarios.map((s) => s.sales_per_cooler)],
    ["Stabilized monthly fleet sales", ...v.scenarios.map((s) => s.stabilized_month.sales)],
    ["Stabilized monthly machine contribution", ...v.scenarios.map((s) => s.stabilized_month.contribution)],
    ["Year 1 sales (with ramp)", ...v.scenarios.map((s) => s.year1.sales)],
    ["Year 1 machine contribution", ...v.scenarios.map((s) => s.year1.contribution)],
    ["Year 1 debt service", ...v.scenarios.map((s) => s.year1.debt_service)],
    ["Year 1 net after debt service", ...v.scenarios.map((s) => s.year1.net_after_debt_service)],
    ["Stabilized annual contribution (Years 2–5)", ...v.scenarios.map((s) => s.stabilized_year.contribution)],
    ["Stabilized annual net after debt service", ...v.scenarios.map((s) => s.stabilized_year.net_after_debt_service)],
    ["Cash low point (Year 1)", ...v.scenarios.map((s) => s.cash_low_point)],
  ];
  return { key: "scenarios", title: "Conservative, base and growth scenarios", columns: ["Measure", ...v.scenarios.map((s) => cap(s.scenario))], rows, money_columns: [1, 2, 3] };
}

function monthlyTable(p: ScenarioProjection): DocTable {
  const rows = p.months.map((m: MonthRow) => [m.month, m.deployed_this_month, m.machines_active, m.sales, m.cogs, m.operating_expenses, m.contribution, m.debt_service, m.opening_inventory_outlay, m.net_cash_flow, m.cumulative_cash]);
  return { key: `monthly_${p.scenario}`, title: `Monthly Year 1 forecast — ${cap(p.scenario)} scenario`, columns: ["Month", "Placed", "Active", "Sales", "COGS", "Operating costs", "Machine contribution", "Debt service", "Opening inventory", "Net cash flow", "Cumulative cash"], rows, money_columns: [3, 4, 5, 6, 7, 8, 9, 10] };
}

function annualTable(p: ScenarioProjection): DocTable {
  const years: YearRow[] = [p.year1, ...p.years_2_to_5];
  const rows = years.map((y) => [`Year ${y.year}`, y.sales, y.cogs, y.operating_expenses, y.contribution, y.debt_service, y.net_after_debt_service]);
  return { key: `annual_${p.scenario}`, title: `Annual forecast Years 1–5 — ${cap(p.scenario)} scenario`, columns: ["Year", "Sales", "COGS", "Operating costs", "Machine contribution", "Debt service", "Net after debt service"], rows, money_columns: [1, 2, 3, 4, 5, 6] };
}

function plTable(p: ScenarioProjection, debt: { interest: number; principal: number }): DocTable {
  const rows: Array<Array<string | number>> = PL_LINES.map((l) => [l.label, p.year1[l.key], p.years_2_to_5[0][l.key]]);
  rows.push(["Loan interest (selected case, Year 1 / Year 2)", debt.interest, debt.principal]);
  return { key: `pl_${p.scenario}`, title: `Projected P&L — ${cap(p.scenario)} scenario (Year 1 with ramp, then a stabilized year)`, columns: ["Line", "Year 1", "Stabilized year"], rows, money_columns: [1, 2], note: "Owner compensation, company overhead, and taxes are not modelled." };
}

function debtTable(v: PlanView): DocTable {
  const rows = v.financing.options.map((o) => [o.label, `${o.term_years} years`, pct(o.annual_rate), o.illustrative.principal, o.illustrative.monthly_payment, o.plan.principal, o.plan.monthly_payment, o.plan.total_interest, o.coverage_ratio ?? ""]);
  return { key: "debt", title: "Debt-payment comparison", columns: ["Case", "Term", "Rate", "Illustrative principal", "Illustrative payment", "Plan request", "Plan payment", "Plan total interest", "Base coverage"], rows, money_columns: [3, 4, 5, 6, 7], note: v.financing.lender_note };
}

function breakEvenTable(v: PlanView): DocTable {
  const rows = v.scenarios.map((s) => [cap(s.scenario), pct(s.break_even.variable_contribution_rate), s.break_even.sales_per_cooler_for_vms, s.break_even.fleet_sales_for_vms_and_debt, s.break_even.sales_per_cooler_for_vms_and_debt]);
  return { key: "break_even", title: "Break-even analysis (monthly)", columns: ["Scenario", "Variable contribution rate", "Per-cooler sales to cover VMS", "Fleet sales to cover VMS + debt", "Per-cooler sales to cover VMS + debt"], rows, money_columns: [2, 3, 4] };
}

function rolloutTable(v: PlanView): DocTable {
  return { key: "rollout", title: "Deployment timeline (base scenario)", columns: ["Month", "Placed", "Active", "Sales", "Machine contribution", "Cumulative cash"], rows: v.timeline.map((t) => [t.month, t.deployed_this_month, t.machines_active, t.sales, t.contribution, t.cumulative_cash]), money_columns: [3, 4, 5] };
}

export function buildPlanDocument(plan: PlanRow, ctx: SectionContext, now: Date = new Date()): PlanDocument {
  const catalog = catalogFromSnapshot(plan.catalog_snapshot);
  const view = plan.outputs;
  const { projections, monthly_debt_service } = projectAll(plan.inputs, catalog);
  const selected = view.financing.options.find((o) => o.case === view.financing.selected_case) ?? view.financing.options[0];
  const tables: DocTable[] = [assumptionsTable(view), sourcesUsesTable(view), perCoolerTable(view), scenarioTable(view), ...projections.map(monthlyTable), ...projections.map(annualTable), ...projections.map((p) => plTable(p, { interest: selected.plan.years[0]?.interest ?? 0, principal: selected.plan.years[1]?.interest ?? 0 })), debtTable(view), breakEvenTable(view), rolloutTable(view)];
  const fc = FINANCING_CASES.find((c) => c.key === view.financing.selected_case) ?? FINANCING_CASES[0];
  return {
    title: `${view.package_name} — Vending Business Plan`,
    subtitle: `${BRAND.name} · ${plan.plan_number} · version ${plan.version} · financing case: ${fc.label}`,
    plan_number: plan.plan_number,
    version: plan.version,
    engine_version: plan.engine_version,
    generated_at: now.toISOString(),
    business_name: view.profile.business_name ?? "Prospective vending operator",
    package_name: view.package_name,
    view,
    sections: buildSections(view, ctx),
    tables,
    projections,
    monthly_debt_service,
    disclaimers: view.disclaimers,
  };
}

/** Filename-safe: plan number plus version, nothing customer-controlled. */
export function exportFilename(plan: PlanRow, ext: "xlsx" | "docx" | "pdf"): string {
  const safe = plan.plan_number.replace(/[^A-Za-z0-9-]/g, "");
  return `VendingConnector-BusinessPlan-${safe}-v${plan.version}.${ext}`;
}
