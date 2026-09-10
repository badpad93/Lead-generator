import { FINANCING_CASES, ILLUSTRATIVE_PRINCIPAL, type Assumptions, type FinancingCase, type RolloutAssumptions, type ScenarioKey } from "./assumptions";
import { amortizedPayment, breakEven, fleetMonth, loanSchedule, rolloutSchedule, round2, type BreakEven, type FleetMonth, type LoanSchedule } from "./engine";

/**
 * Scenario projections: Year 1 by month with the deployment ramp, Years
 * 2–5 stabilized, debt service, cash flow, and break-even. Existing
 * operators keep their current machines as a baseline that earns from
 * month one; only the new machines ramp.
 */
export interface Baseline {
  machines: number;
  monthly_sales: number;
}

export interface ProjectionInput {
  scenario: ScenarioKey;
  sales_per_cooler: number;
  new_machines: number;
  baseline: Baseline;
  a: Assumptions;
  rollout: RolloutAssumptions;
  /** Monthly payment on the plan's financing request under the selected case (0 when unfinanced). */
  monthly_debt_service: number;
  /** Cash on hand at month 0: the working-capital allowance (opening inventory is spent as machines deploy). */
  starting_cash: number;
}

export interface MonthRow extends FleetMonth {
  month: number;
  deployed_this_month: number;
  new_machine_sales: number;
  baseline_sales: number;
  debt_service: number;
  opening_inventory_outlay: number;
  net_cash_flow: number;
  cumulative_cash: number;
}

export interface YearRow extends FleetMonth {
  year: number;
  debt_service: number;
  net_after_debt_service: number;
}

export interface ScenarioProjection {
  scenario: ScenarioKey;
  sales_per_cooler: number;
  months: MonthRow[];
  year1: YearRow;
  years_2_to_5: YearRow[];
  stabilized_month: FleetMonth;
  per_cooler_month: FleetMonth;
  break_even: BreakEven;
  /** Months until cumulative cash stops falling (null when it never turns within Year 1). */
  cash_low_point_month: number | null;
  cash_low_point: number;
}

function totals(rows: FleetMonth[], machinesActive: number): FleetMonth {
  const keys = Object.keys(rows[0] ?? {}) as Array<keyof FleetMonth>;
  const out = {} as FleetMonth;
  for (const k of keys) out[k] = round2(rows.reduce((s, r) => s + r[k], 0));
  out.machines_active = machinesActive;
  return out;
}

function monthRows(input: ProjectionInput): MonthRow[] {
  const schedule = rolloutSchedule(input.new_machines, input.rollout);
  let cash = round2(input.starting_cash);
  return schedule.map((r) => {
    const newSales = round2(r.sales_factor * input.sales_per_cooler);
    const baseSales = round2(input.baseline.monthly_sales);
    const fm = fleetMonth(newSales + baseSales, r.machines_active + input.baseline.machines, input.a);
    const inventory = round2(r.deployed_this_month * input.a.opening_inventory_per_cooler);
    const debt = input.monthly_debt_service;
    const net = round2(fm.contribution - debt - inventory);
    cash = round2(cash + net);
    return { ...fm, month: r.month, deployed_this_month: r.deployed_this_month, new_machine_sales: newSales, baseline_sales: baseSales, debt_service: debt, opening_inventory_outlay: inventory, net_cash_flow: net, cumulative_cash: cash };
  });
}

export function projectScenario(input: ProjectionInput): ScenarioProjection {
  const months = monthRows(input);
  const machines = input.new_machines + input.baseline.machines;
  const y1 = totals(months, machines);
  const year1: YearRow = { ...y1, year: 1, debt_service: round2(input.monthly_debt_service * 12), net_after_debt_service: round2(y1.contribution - input.monthly_debt_service * 12) };
  const stabilized = fleetMonth(input.sales_per_cooler * input.new_machines + input.baseline.monthly_sales, machines, input.a);
  const annual = totals(Array(12).fill(stabilized) as FleetMonth[], machines);
  const years_2_to_5: YearRow[] = [2, 3, 4, 5].map((year) => ({ ...annual, year, debt_service: year1.debt_service, net_after_debt_service: round2(annual.contribution - year1.debt_service) }));
  const low = months.reduce((best, m) => (m.cumulative_cash < best.cumulative_cash ? m : best), months[0]);
  return {
    scenario: input.scenario,
    sales_per_cooler: input.sales_per_cooler,
    months,
    year1,
    years_2_to_5,
    stabilized_month: stabilized,
    per_cooler_month: fleetMonth(input.sales_per_cooler, 1, input.a),
    break_even: breakEven(input.a, machines, input.monthly_debt_service),
    cash_low_point_month: low ? low.month : null,
    cash_low_point: low ? low.cumulative_cash : round2(input.starting_cash),
  };
}

// ─── Debt comparison ────────────────────────────────────────────────

export interface DebtOption {
  case: FinancingCase["key"];
  label: string;
  term_years: number;
  annual_rate: number;
  /** The approved illustrative $55,000 case. */
  illustrative: { principal: number; monthly_payment: number };
  /** The same terms applied to this plan's financing request. */
  plan: LoanSchedule;
  /** Annual base-scenario contribution ÷ annual debt service (illustrative coverage, not underwriting). */
  coverage_ratio: number | null;
}

export function debtComparison(financingRequest: number, annualBaseContribution: number): DebtOption[] {
  return FINANCING_CASES.map((c) => {
    const plan = loanSchedule(financingRequest, c.annual_rate, c.term_years);
    const annualService = round2(plan.monthly_payment * 12);
    return {
      case: c.key,
      label: c.label,
      term_years: c.term_years,
      annual_rate: c.annual_rate,
      illustrative: { principal: ILLUSTRATIVE_PRINCIPAL, monthly_payment: amortizedPayment(ILLUSTRATIVE_PRINCIPAL, c.annual_rate, c.term_years) },
      plan,
      coverage_ratio: annualService > 0 ? Math.round((annualBaseContribution / annualService) * 100) / 100 : null,
    };
  });
}
