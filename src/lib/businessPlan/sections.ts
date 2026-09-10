import { PACKAGES } from "./packages";
import type { PlanView, ScenarioSummary } from "./plan";
import type { OperatorProfile } from "./profile";

/**
 * The 21 narrative sections of the business plan, generated only from the
 * canonical plan view. Where the customer has not supplied a fact, the
 * text says so instead of inventing background, locations, contracts,
 * lender decisions, or capability.
 */
export interface PlanSection {
  number: number;
  title: string;
  paragraphs: string[];
}

export const SECTION_TITLES = [
  "Executive summary",
  "Customer goals and operating profile",
  "Recommended launch package",
  "Products and services being offered",
  "Startup-cost estimate",
  "Sources and uses of funds",
  "Per-machine unit economics",
  "Conservative, base and growth scenarios",
  "Monthly Year 1 forecast",
  "Annual Years 2–5 forecast",
  "Projected P&L",
  "Simplified cash-flow projection",
  "Debt-payment comparison",
  "Break-even analysis",
  "Deployment and restocking plan",
  "Location-acquisition strategy",
  "Sales and merchandising strategy",
  "Risks and mitigations",
  "Milestones and 90-day action plan",
  "Quote summary",
  "Financing next step",
] as const;

export interface SectionContext {
  quote: { quote_number: string; subtotal: number; line_count: number; status: string } | null;
  financing_status: "none" | "application_started" | "application_submitted";
}

export const usd = (n: number): string => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
export const pct = (f: number): string => `${Math.round(f * 10000) / 100}%`;
const NOT_PROVIDED = "not yet provided";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const yn = (b: boolean | null): string => {
  if (b === null) return NOT_PROVIDED;
  return b ? "yes" : "no";
};
const orNot = (v: string | null): string => v ?? NOT_PROVIDED;
const moneyOrNot = (v: number | null): string => (v === null ? NOT_PROVIDED : usd(v));
const OPERATOR_TYPE: Record<string, string> = { new: "new operator", existing: "existing operator" };
const STAFFING: Record<string, string> = { owner_operated: "owner-operated", staffed: "staffed" };

const assumption = (v: PlanView, key: string): number => v.assumptions.find((a) => a.key === key)?.value ?? 0;
const scenario = (v: PlanView, key: ScenarioSummary["scenario"]): ScenarioSummary => v.scenarios.find((s) => s.scenario === key) ?? v.scenarios[0];

function profileFacts(v: PlanView): string[] {
  const p: OperatorProfile = v.profile;
  const facts = [
    `Operator type: ${p.operator_type === null ? NOT_PROVIDED : OPERATOR_TYPE[p.operator_type]}.`,
    `Business name: ${orNot(p.business_name)}.`,
    `Territory and service radius: ${orNot(p.territory)}${p.service_radius_miles !== null ? ` (about ${p.service_radius_miles} miles)` : ""}.`,
    `Vending experience: ${orNot(p.vending_experience)}.`,
    `Weekly hours available: ${p.weekly_hours_available === null ? NOT_PROVIDED : String(p.weekly_hours_available)}. Staffing: ${p.staffing === null ? NOT_PROVIDED : STAFFING[p.staffing]}.`,
    `Vehicle: ${yn(p.has_vehicle)}. Storage: ${yn(p.has_storage)}.`,
    `Desired launch: ${orNot(p.desired_launch)}.`,
    `Monthly cash-flow goal from the machines: ${moneyOrNot(p.monthly_cash_flow_goal)}.`,
    `Cash available: ${moneyOrNot(p.cash_available)}. Financing interest: ${yn(p.financing_interest)}.`,
  ];
  if (v.baseline.machines > 0) facts.push(`Existing business: ${v.baseline.machines} machine(s) producing about ${usd(v.baseline.monthly_sales)} per month, kept as a baseline that does not ramp.`);
  return facts;
}

function scenarioLine(v: PlanView, key: ScenarioSummary["scenario"]): string {
  const s = scenario(v, key);
  return `${key[0].toUpperCase()}${key.slice(1)} (${usd(s.sales_per_cooler)} per cooler per month): stabilized machine contribution ${usd(s.stabilized_month.contribution)} per month across the fleet; Year 1 contribution ${usd(s.year1.contribution)} with ${usd(s.year1.debt_service)} of debt service, leaving ${usd(s.year1.net_after_debt_service)}.`;
}

function perCooler(v: PlanView): string[] {
  const c = scenario(v, "base").per_cooler_month;
  return [
    `One stabilized cooler at ${usd(c.sales)} per month handles about ${c.transactions} transactions at ${usd(assumption(v, "average_transaction"))} each. Product cost is ${pct(assumption(v, "cogs_rate"))} of sales (${usd(c.cogs)}), leaving a gross margin of ${usd(c.gross_profit)}.`,
    `Operating costs per cooler: VMS ${usd(c.vms)}, percentage processing ${usd(c.processing)} (${pct(assumption(v, "processing_rate"))}), debit fees ${usd(c.debit_fees)} (${pct(assumption(v, "debit_share"))} of transactions at ${usd(assumption(v, "debit_fee"))}), shrink ${usd(c.shrink)}, repair reserve ${usd(c.repair_reserve)}, restocking labor and fuel ${usd(c.restocking)}.`,
    `Pre-commission machine contribution: ${usd(c.pre_fee_contribution)}. With the customer's commission assumption (${pct(assumption(v, "location_fee_rate"))}) the contribution is ${usd(c.contribution)}; under the 10% commission stress case it is ${usd(c.contribution_after_stress)}. Contribution is before company overhead, taxes, owner compensation, and debt service.`,
  ];
}

const FINANCING_STATUS_TEXT: Record<SectionContext["financing_status"], string> = {
  application_submitted: "A financing application has been submitted; the Vending Connector team follows up personally and the lender decides.",
  application_started: "A financing application has been started through the secure Vending Connector financing form.",
  none: "The next step is the secure Vending Connector financing application, which collects the lender's required details outside this conversation.",
};

function financingNext(v: PlanView, ctx: SectionContext): string[] {
  const sel = v.financing.options.find((o) => o.case === v.financing.selected_case) ?? v.financing.options[0];
  const su = v.sources_and_uses;
  return [
    `The plan's financing request is ${usd(su.financing_request)}: ${usd(su.quotable_subtotal)} of quotable Vending Connector items plus a ${usd(su.working_capital_allowance)} working-capital allowance, less ${usd(su.owner_cash)} of owner cash. Under the ${sel.label} (${sel.term_years} years at ${pct(sel.annual_rate)}) the illustrative payment is ${usd(sel.plan.monthly_payment)} per month.`,
    FINANCING_STATUS_TEXT[ctx.financing_status],
    v.financing.lender_note,
  ];
}

function executiveSummary(v: PlanView): string[] {
  const su = v.sources_and_uses;
  const base = scenario(v, "base");
  const verb = v.baseline.machines > 0 ? "expand an existing vending route" : "launch a vending business";
  return [
    `${v.profile.business_name ?? "This operator"} plans to ${verb} with the ${v.package_name}: ${plural(v.machines, "VendEra AI cooler")}${v.website.included ? " and a Vending Connector website" : ""}. Total uses of funds are ${usd(su.total_uses)}, with a financing request of ${usd(su.financing_request)}.`,
    `In the base scenario the fleet produces ${usd(base.stabilized_year.sales)} of annual sales once stabilized and ${usd(base.stabilized_year.contribution)} of machine contribution before overhead, taxes, owner pay, and debt service.`,
    v.disclaimers[0],
  ];
}

function packageSection(v: PlanView): string[] {
  const pkg = PACKAGES[v.package];
  const rec = v.recommendation;
  const fit = rec.honest_downsell
    ? `Vending Connector leads with the 10/10/10 Launch Plan. Based on the inputs supplied, the ${PACKAGES[rec.recommended].name} is the more suitable starting point: ${rec.ladder.filter((r) => !r.suitable).flatMap((r) => r.reasons).join(" ")}`
    : "The 10/10/10 Launch Plan is Vending Connector's primary full-business launch option and the inputs supplied do not rule it out.";
  return [`${pkg.name}: ${pkg.pitch}`, fit, `This plan models the ${v.package_name} (${plural(v.machines, "machine")}).`];
}

function fundingSections(v: PlanView): string[][] {
  const su = v.sources_and_uses;
  const inventory = su.uses.find((u) => u.key === "opening_inventory")?.amount ?? 0;
  return [
    su.uses.filter((u) => u.quotable || u.key === "website").map((u) => `${u.label}: ${u.quantity} × ${usd(u.unit_amount)} = ${usd(u.amount)}. ${u.note ?? ""}`.trim()).concat([su.placement_note]),
    [`Startup costs total ${usd(su.total_uses)}: ${usd(su.quotable_subtotal)} of Vending Connector catalog items (planning estimate; the final quote uses current catalog prices) plus ${usd(su.working_capital_allowance)} of working capital, of which ${usd(inventory)} is opening inventory.`, "Opening inventory is startup cash, not a recurring expense, so it is not deducted again in the monthly projections."],
    su.uses.map((u) => `${u.label}: ${usd(u.amount)}${u.quotable ? "" : " (not an invoice line)"}.`).concat([`Sources: owner cash ${usd(su.owner_cash)}, financing request ${usd(su.financing_request)}; total ${usd(su.total_uses)}.`]),
  ];
}

function forecastSections(v: PlanView): string[][] {
  const base = scenario(v, "base");
  const r = v.rollout;
  return [
    [scenarioLine(v, "conservative"), scenarioLine(v, "base"), scenarioLine(v, "growth"), "Scenario sales levels are assumptions, not forecasts of any specific location."],
    [`Year 1 follows the rollout: ${r.machines_per_month} machine(s) per month over ${r.deployment_months} month(s), each producing ${pct(r.ramp[0])}, ${pct(r.ramp[1])}, then ${pct(r.ramp[2])} of stabilized sales in its first three active months.`, `Base scenario Year 1: sales ${usd(base.year1.sales)}, machine contribution ${usd(base.year1.contribution)}, debt service ${usd(base.year1.debt_service)}, net ${usd(base.year1.net_after_debt_service)}. The month-by-month table is in the financial tables.`],
    [`Years 2–5 assume every machine at stabilized sales with no growth beyond the scenario level. Base scenario per year: sales ${usd(base.stabilized_year.sales)}, machine contribution ${usd(base.stabilized_year.contribution)}, debt service ${usd(base.stabilized_year.debt_service)}, net ${usd(base.stabilized_year.net_after_debt_service)}.`],
    [`The projected P&L lists sales, product cost (${pct(assumption(v, "cogs_rate"))}), gross margin, VMS, processing, debit fees, shrink, repair reserve, restocking, commission, machine contribution, and interest and principal from the selected loan case. Owner compensation, company overhead, and taxes are not modelled and would reduce these figures.`],
    [`Cash starts at the working-capital allowance of ${usd(v.sources_and_uses.working_capital_allowance)}. Each month adds machine contribution and subtracts debt service and the opening inventory for machines placed that month. In the base scenario the cash low point is ${usd(base.cash_low_point)}${base.cash_low_point_month ? ` in month ${base.cash_low_point_month}` : ""}.`],
    v.financing.options.map((o) => `${o.label} (${o.term_years} years at ${pct(o.annual_rate)}): illustrative ${usd(o.illustrative.principal)} case ${usd(o.illustrative.monthly_payment)} per month; this plan's ${usd(o.plan.principal)} request ${usd(o.plan.monthly_payment)} per month, ${usd(o.plan.total_interest)} total interest${o.coverage_ratio !== null ? `, base-scenario coverage ${o.coverage_ratio}×` : ""}.`).concat([v.financing.lender_note]),
    [`Each cooler covers its VMS fee at ${usd(base.break_even.sales_per_cooler_for_vms)} of monthly sales (variable contribution ${pct(base.break_even.variable_contribution_rate)} of sales). Covering VMS for every machine plus the selected loan payment takes ${usd(base.break_even.fleet_sales_for_vms_and_debt)} of fleet sales per month, about ${usd(base.break_even.sales_per_cooler_for_vms_and_debt)} per cooler.`],
  ];
}

function operationsSections(v: PlanView): string[][] {
  const p = v.profile;
  const hours = p.weekly_hours_available !== null ? `the customer has ${p.weekly_hours_available} hours per week available` : "weekly hours available were not provided";
  const assets = `${p.has_vehicle === true ? " and a vehicle" : ""}${p.has_storage === true ? " and storage" : ""}`;
  return [
    [`Deployment: ${v.rollout.machines_per_month} machine(s) per month over ${v.rollout.deployment_months} month(s). Restocking labor and fuel are budgeted at ${pct(assumption(v, "restocking_rate"))} of sales; ${hours}${assets}.`],
    [v.sources_and_uses.placement_note, p.territory ? `Target territory: ${p.territory}.` : "The target territory has not been provided.", "No locations, contracts, or placements are assumed to exist until the location team records them."],
    [`Pricing assumes an average transaction of ${usd(assumption(v, "average_transaction"))} and a product cost of ${pct(assumption(v, "cogs_rate"))} of sales. Merchandising choices, product mix, and pricing are the operator's decisions and drive the actual result.`],
    ["Sales below the scenario levels, longer placement timelines, shrink above the reserve, equipment repairs beyond the reserve, and commission requests from locations are the main risks. The conservative scenario, the commission stress case, the repair reserve, and the working-capital allowance are the mitigations modelled here; none of them guarantees an outcome."],
    [`Days 1–30: confirm financing, sign the machine purchase agreement, and start the location process. Days 31–60: receive the first ${Math.min(v.machines, v.rollout.machines_per_month)} machine(s), stock, and open. Days 61–90: place the next machines on the rollout schedule and review sales against the conservative scenario.${p.desired_launch ? ` Desired launch: ${p.desired_launch}.` : ""}`],
  ];
}

function quoteSummary(v: PlanView, ctx: SectionContext): string[] {
  const su = v.sources_and_uses;
  if (ctx.quote) return [`Quote ${ctx.quote.quote_number} (${ctx.quote.status}): ${ctx.quote.line_count} line(s), subtotal ${usd(ctx.quote.subtotal)} pre-tax at current catalog prices. Working capital of ${usd(su.working_capital_allowance)} is part of the financing request, not the quote.`];
  const placements = v.package === "ten_ten_ten" ? "the 10/10/10 placements, " : "";
  return [`No quote has been created yet. When confirmed, the quote will list the ${v.machines} cooler(s), freight, ${placements}${v.website.included ? "and the website " : ""}at current catalog prices; working capital is never an invoice line.`];
}

export function buildSections(v: PlanView, ctx: SectionContext): PlanSection[] {
  const bodies: string[][] = [executiveSummary(v), profileFacts(v), packageSection(v), ...fundingSections(v), perCooler(v), ...forecastSections(v), ...operationsSections(v), quoteSummary(v, ctx), financingNext(v, ctx)];
  return SECTION_TITLES.map((title, i) => ({ number: i + 1, title, paragraphs: bodies[i] }));
}
