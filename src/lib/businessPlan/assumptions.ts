/**
 * Vending business-plan assumptions (vending only; no coffee).
 *
 * Every number the plan uses comes from one of three places and is
 * labelled as such everywhere it is shown: the customer, the Vending
 * Connector default table below, or a deterministic calculation. The
 * model never supplies or computes any of them; it only relays tool output.
 *
 * Bump ENGINE_VERSION when a formula or a default changes; the version is
 * stored on every saved plan so an old plan can be recalculated knowingly.
 */
export const ENGINE_VERSION = "2026-09-10.1";

export type AssumptionSource = "customer" | "default" | "calculated";

export type PackageKey = "ten_ten_ten" | "five_machine" | "single_machine";
export const PACKAGE_KEYS: readonly PackageKey[] = ["ten_ten_ten", "five_machine", "single_machine"];

export type ScenarioKey = "conservative" | "base" | "growth";
export const SCENARIO_KEYS: readonly ScenarioKey[] = ["conservative", "base", "growth"];

/** Rates are fractions of sales; money is USD. */
export interface Assumptions {
  /** Stabilized monthly sales per cooler by scenario. */
  sales_conservative: number;
  sales_base: number;
  sales_growth: number;
  average_transaction: number;
  /** Product cost as a fraction of sales (gross margin = 1 - cogs_rate). */
  cogs_rate: number;
  vms_fee_per_cooler: number;
  processing_rate: number;
  debit_share: number;
  debit_fee: number;
  shrink_rate: number;
  repair_reserve_rate: number;
  restocking_rate: number;
  /** Location commission as a fraction of positive pre-commission contribution (usually 0). */
  location_fee_rate: number;
  /** Startup cash, not a recurring expense. */
  opening_inventory_per_cooler: number;
  /** Working-capital allowance per cooler; includes the opening inventory. */
  working_capital_per_cooler: number;
}

export const DEFAULT_ASSUMPTIONS: Readonly<Assumptions> = Object.freeze({
  sales_conservative: 600,
  sales_base: 800,
  sales_growth: 1000,
  average_transaction: 3.5,
  cogs_rate: 0.45,
  vms_fee_per_cooler: 40,
  processing_rate: 0.0585,
  debit_share: 0.2,
  debit_fee: 0.22,
  shrink_rate: 0.03,
  repair_reserve_rate: 0.03,
  restocking_rate: 0.08,
  location_fee_rate: 0,
  opening_inventory_per_cooler: 500,
  working_capital_per_cooler: 1000,
});

/** The stress case the plan always shows alongside the customer's commission. */
export const COMMISSION_STRESS_RATE = 0.1;

export interface RolloutAssumptions {
  /** Machines placed per month until the package count is reached. */
  machines_per_month: number;
  /** Share of stabilized sales in a machine's first, second, and later active months. */
  ramp: [number, number, number];
}

export const DEFAULT_ROLLOUT: Readonly<RolloutAssumptions> = Object.freeze({ machines_per_month: 2, ramp: [0.6, 0.8, 1] as [number, number, number] });

export interface FinancingCase {
  key: "sba" | "alternative";
  label: string;
  term_years: number;
  annual_rate: number;
}

/** Approved illustrative cases. Terms, rates, eligibility, and approval are the lender's. */
export const FINANCING_CASES: readonly FinancingCase[] = Object.freeze([
  { key: "sba", label: "SBA estimate", term_years: 10, annual_rate: 0.1 },
  { key: "alternative", label: "Alternative estimate", term_years: 5, annual_rate: 0.17 },
]);

/** The approved illustrative principal shown next to the plan-specific request. */
export const ILLUSTRATIVE_PRINCIPAL = 55_000;

export const ASSUMPTION_LABELS: Record<keyof Assumptions, string> = {
  sales_conservative: "Conservative monthly sales per cooler",
  sales_base: "Stabilized monthly sales per cooler (base)",
  sales_growth: "Growth monthly sales per cooler",
  average_transaction: "Average transaction",
  cogs_rate: "Product cost (COGS) share of sales",
  vms_fee_per_cooler: "VMS fee per cooler per month",
  processing_rate: "Percentage processing fee",
  debit_share: "Debit share of transactions",
  debit_fee: "Debit transaction fee",
  shrink_rate: "Shrink",
  repair_reserve_rate: "Repair reserve",
  restocking_rate: "Restocking labor and fuel",
  location_fee_rate: "Location commission (share of machine contribution)",
  opening_inventory_per_cooler: "Opening inventory per cooler (startup cash)",
  working_capital_per_cooler: "Working-capital allowance per cooler",
};

export const RATE_KEYS: ReadonlySet<keyof Assumptions> = new Set<keyof Assumptions>(["cogs_rate", "processing_rate", "debit_share", "shrink_rate", "repair_reserve_rate", "restocking_rate", "location_fee_rate"]);

/** Inclusive bounds a customer-supplied override must respect. */
export const ASSUMPTION_BOUNDS: Record<keyof Assumptions, readonly [number, number]> = {
  sales_conservative: [0, 20_000],
  sales_base: [0, 20_000],
  sales_growth: [0, 20_000],
  average_transaction: [0.5, 50],
  cogs_rate: [0, 0.95],
  vms_fee_per_cooler: [0, 500],
  processing_rate: [0, 0.2],
  debit_share: [0, 1],
  debit_fee: [0, 2],
  shrink_rate: [0, 0.3],
  repair_reserve_rate: [0, 0.3],
  restocking_rate: [0, 0.5],
  location_fee_rate: [0, 0.5],
  opening_inventory_per_cooler: [0, 5_000],
  working_capital_per_cooler: [0, 20_000],
};

export type AssumptionOverrides = Partial<Assumptions>;

export interface LabelledAssumption {
  key: keyof Assumptions;
  label: string;
  value: number;
  /** "percent" values are fractions shown as percentages; "money" in USD. */
  format: "percent" | "money";
  source: AssumptionSource;
}

/** Merge customer overrides over the defaults, clamping nothing: out-of-range values are rejected by the tool schema. */
export function resolveAssumptions(overrides: AssumptionOverrides | null | undefined): { values: Assumptions; sources: Record<keyof Assumptions, AssumptionSource> } {
  const values: Assumptions = { ...DEFAULT_ASSUMPTIONS };
  const sources = {} as Record<keyof Assumptions, AssumptionSource>;
  for (const key of Object.keys(DEFAULT_ASSUMPTIONS) as Array<keyof Assumptions>) {
    const o = overrides?.[key];
    if (typeof o === "number" && Number.isFinite(o)) {
      values[key] = o;
      sources[key] = "customer";
    } else {
      sources[key] = "default";
    }
  }
  return { values, sources };
}

export function labelAssumptions(values: Assumptions, sources: Record<keyof Assumptions, AssumptionSource>): LabelledAssumption[] {
  return (Object.keys(DEFAULT_ASSUMPTIONS) as Array<keyof Assumptions>).map((key) => ({
    key,
    label: ASSUMPTION_LABELS[key],
    value: values[key],
    format: RATE_KEYS.has(key) ? "percent" : "money",
    source: sources[key],
  }));
}
