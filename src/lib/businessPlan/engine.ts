import { COMMISSION_STRESS_RATE, FINANCING_CASES, type Assumptions, type FinancingCase, type RolloutAssumptions } from "./assumptions";

/**
 * Deterministic vending economics. Pure functions, no I/O, no randomness.
 *
 * Rounding rule: every money line is rounded to the cent as it is produced
 * and every subtotal is the sum of its rounded lines, so the tables in the
 * chat, the spreadsheet, the document, and the PDF always add up to the
 * same figures. Machine contribution is before company overhead, taxes,
 * owner compensation, and debt service; it is never "net profit".
 */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const sum = (...xs: number[]): number => round2(xs.reduce((a, b) => a + b, 0));

export interface FleetMonth {
  machines_active: number;
  sales: number;
  transactions: number;
  debit_transactions: number;
  cogs: number;
  gross_profit: number;
  vms: number;
  processing: number;
  debit_fees: number;
  shrink: number;
  repair_reserve: number;
  restocking: number;
  operating_expenses: number;
  pre_fee_contribution: number;
  location_fee: number;
  contribution: number;
  /** Commission stress case: 10% of positive pre-commission contribution. */
  location_fee_stress: number;
  contribution_after_stress: number;
}

/** One month for `machinesActive` machines producing `sales` in total. */
export function fleetMonth(sales: number, machinesActive: number, a: Assumptions): FleetMonth {
  const s = round2(Math.max(0, sales));
  const transactions = a.average_transaction > 0 ? s / a.average_transaction : 0;
  const debit_transactions = transactions * a.debit_share;
  const cogs = round2(s * a.cogs_rate);
  const vms = round2(machinesActive * a.vms_fee_per_cooler);
  const processing = round2(s * a.processing_rate);
  const debit_fees = round2(debit_transactions * a.debit_fee);
  const shrink = round2(s * a.shrink_rate);
  const repair_reserve = round2(s * a.repair_reserve_rate);
  const restocking = round2(s * a.restocking_rate);
  const operating_expenses = sum(vms, processing, debit_fees, shrink, repair_reserve, restocking);
  const pre = round2(s - cogs - operating_expenses);
  const positive = Math.max(0, pre);
  const location_fee = round2(positive * a.location_fee_rate);
  const location_fee_stress = round2(positive * COMMISSION_STRESS_RATE);
  return {
    machines_active: machinesActive,
    sales: s,
    transactions: round2(transactions),
    debit_transactions: round2(debit_transactions),
    cogs,
    gross_profit: round2(s - cogs),
    vms,
    processing,
    debit_fees,
    shrink,
    repair_reserve,
    restocking,
    operating_expenses,
    pre_fee_contribution: pre,
    location_fee,
    contribution: round2(pre - location_fee),
    location_fee_stress,
    contribution_after_stress: round2(pre - location_fee_stress),
  };
}

/** One stabilized cooler for one month. */
export function coolerMonth(salesPerCooler: number, a: Assumptions): FleetMonth {
  return fleetMonth(salesPerCooler, 1, a);
}

/** Contribution earned per dollar of sales before VMS (the only fixed per-machine cost). */
export function variableContributionRate(a: Assumptions): number {
  const debitPerDollar = a.average_transaction > 0 ? (a.debit_share * a.debit_fee) / a.average_transaction : 0;
  return 1 - a.cogs_rate - a.processing_rate - a.shrink_rate - a.repair_reserve_rate - a.restocking_rate - debitPerDollar;
}

export interface BreakEven {
  variable_contribution_rate: number;
  /** Monthly sales per cooler at which pre-commission contribution is zero. */
  sales_per_cooler_for_vms: number;
  /** Monthly fleet sales that cover VMS for every machine plus the monthly loan payment. */
  fleet_sales_for_vms_and_debt: number;
  sales_per_cooler_for_vms_and_debt: number;
}

export function breakEven(a: Assumptions, machines: number, monthlyDebtService: number): BreakEven {
  const rate = variableContributionRate(a);
  const safe = rate > 0 ? rate : Number.NaN;
  const perCooler = a.vms_fee_per_cooler / safe;
  const fleet = (a.vms_fee_per_cooler * machines + monthlyDebtService) / safe;
  const finite = (n: number) => (Number.isFinite(n) ? round2(n) : 0);
  return {
    variable_contribution_rate: Math.round(rate * 1e6) / 1e6,
    sales_per_cooler_for_vms: finite(perCooler),
    fleet_sales_for_vms_and_debt: finite(fleet),
    sales_per_cooler_for_vms_and_debt: finite(machines > 0 ? fleet / machines : 0),
  };
}

// ─── Amortizing loans ────────────────────────────────────────────────

/** Standard amortizing payment: P·r / (1 − (1+r)^−n), r monthly, n months. Zero-rate loans divide evenly. */
export function amortizedPayment(principal: number, annualRate: number, termYears: number): number {
  const n = Math.round(termYears * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return round2(principal / n);
  return round2((principal * r) / (1 - Math.pow(1 + r, -n)));
}

export interface ScheduleYear {
  year: number;
  payments: number;
  interest: number;
  principal: number;
  ending_balance: number;
}

export interface LoanSchedule {
  principal: number;
  annual_rate: number;
  term_years: number;
  monthly_payment: number;
  total_paid: number;
  total_interest: number;
  years: ScheduleYear[];
  /** First twelve months: payment, interest, principal, balance. */
  months: Array<{ month: number; payment: number; interest: number; principal: number; balance: number }>;
}

/** Month-by-month schedule summarised per year; the final payment absorbs rounding so the balance ends at zero. */
export function loanSchedule(principal: number, annualRate: number, termYears: number): LoanSchedule {
  const n = Math.round(termYears * 12);
  const payment = amortizedPayment(principal, annualRate, termYears);
  const r = annualRate / 12;
  let balance = round2(principal);
  const years: ScheduleYear[] = [];
  const months: LoanSchedule["months"] = [];
  let totalInterest = 0;
  let totalPaid = 0;
  for (let m = 1; m <= n; m += 1) {
    const interest = round2(balance * r);
    const isLast = m === n;
    const pay = isLast ? round2(balance + interest) : payment;
    const principalPart = round2(pay - interest);
    balance = isLast ? 0 : round2(balance - principalPart);
    totalInterest = round2(totalInterest + interest);
    totalPaid = round2(totalPaid + pay);
    if (m <= 12) months.push({ month: m, payment: pay, interest, principal: principalPart, balance });
    const y = Math.ceil(m / 12);
    const row = years[y - 1] ?? (years[y - 1] = { year: y, payments: 0, interest: 0, principal: 0, ending_balance: 0 });
    row.payments = round2(row.payments + pay);
    row.interest = round2(row.interest + interest);
    row.principal = round2(row.principal + principalPart);
    row.ending_balance = balance;
  }
  return { principal: round2(principal), annual_rate: annualRate, term_years: termYears, monthly_payment: payment, total_paid: totalPaid, total_interest: totalInterest, years, months };
}

export function financingCase(key: FinancingCase["key"]): FinancingCase {
  const c = FINANCING_CASES.find((f) => f.key === key);
  if (!c) throw new Error(`unknown financing case ${key}`);
  return c;
}

// ─── Rollout ─────────────────────────────────────────────────────────

export interface RolloutMonth {
  month: number;
  deployed_this_month: number;
  machines_active: number;
  /** Sum of each active machine's ramp factor (e.g. 2 machines at 60% = 1.2). */
  sales_factor: number;
}

/** Month `m` factor for a machine first active in `deployMonth`. */
function rampFactor(month: number, deployMonth: number, ramp: RolloutAssumptions["ramp"]): number {
  const k = month - deployMonth + 1;
  if (k < 1) return 0;
  return ramp[Math.min(k, 3) - 1];
}

/** Twelve months of deployment for `machines` new machines. */
export function rolloutSchedule(machines: number, rollout: RolloutAssumptions, months = 12): RolloutMonth[] {
  const perMonth = Math.max(1, Math.floor(rollout.machines_per_month));
  const deployMonthOf = (i: number) => Math.floor(i / perMonth) + 1;
  const out: RolloutMonth[] = [];
  for (let m = 1; m <= months; m += 1) {
    let deployed = 0;
    let active = 0;
    let factor = 0;
    for (let i = 0; i < machines; i += 1) {
      const d = deployMonthOf(i);
      if (d === m) deployed += 1;
      if (d <= m) active += 1;
      factor += rampFactor(m, d, rollout.ramp);
    }
    out.push({ month: m, deployed_this_month: deployed, machines_active: active, sales_factor: Math.round(factor * 1000) / 1000 });
  }
  return out;
}

/** Months until every machine is placed (0 when there are none). */
export function deploymentMonths(machines: number, rollout: RolloutAssumptions): number {
  return machines <= 0 ? 0 : Math.ceil(machines / Math.max(1, Math.floor(rollout.machines_per_month)));
}
