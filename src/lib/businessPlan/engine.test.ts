import { describe, it, expect } from "vitest";
import { DEFAULT_ASSUMPTIONS, DEFAULT_ROLLOUT, FINANCING_CASES, ILLUSTRATIVE_PRINCIPAL, resolveAssumptions } from "./assumptions";
import { amortizedPayment, breakEven, coolerMonth, deploymentMonths, fleetMonth, loanSchedule, rolloutSchedule, round2, variableContributionRate } from "./engine";
import { projectScenario, debtComparison } from "./projection";

const a = DEFAULT_ASSUMPTIONS;

describe("per-cooler month (approved formulas)", () => {
  const CASES = [
    { sales: 600, tx: 171.43, debitTx: 34.29, cogs: 270, gm: 330, proc: 35.1, debitFee: 7.54, shrink: 18, repair: 18, restock: 48, vms: 40, contribution: 163.36 },
    { sales: 800, tx: 228.57, debitTx: 45.71, cogs: 360, gm: 440, proc: 46.8, debitFee: 10.06, shrink: 24, repair: 24, restock: 64, vms: 40, contribution: 231.14 },
    { sales: 1000, tx: 285.71, debitTx: 57.14, cogs: 450, gm: 550, proc: 58.5, debitFee: 12.57, shrink: 30, repair: 30, restock: 80, vms: 40, contribution: 298.93 },
  ];
  it.each(CASES)("sales $sales: transactions, debit, COGS, margin, processing, debit fees, shrink, repair, restocking, VMS, contribution", (c) => {
    const m = coolerMonth(c.sales, a);
    expect(m.transactions).toBeCloseTo(c.tx, 2);
    expect(m.debit_transactions).toBeCloseTo(c.debitTx, 2);
    expect(m.cogs).toBe(c.cogs);
    expect(m.gross_profit).toBe(c.gm);
    expect(m.processing).toBe(c.proc);
    expect(m.debit_fees).toBe(c.debitFee);
    expect(m.shrink).toBe(c.shrink);
    expect(m.repair_reserve).toBe(c.repair);
    expect(m.restocking).toBe(c.restock);
    expect(m.vms).toBe(c.vms);
    expect(m.pre_fee_contribution).toBe(c.contribution);
    // Commission usually $0; the stress case is 10% of positive pre-commission contribution.
    expect(m.location_fee).toBe(0);
    expect(m.contribution).toBe(c.contribution);
    expect(m.location_fee_stress).toBe(round2(c.contribution * 0.1));
    expect(m.contribution_after_stress).toBe(round2(c.contribution - round2(c.contribution * 0.1)));
  });

  it("adds up: sales − COGS − every operating line equals the pre-commission contribution, to the cent", () => {
    for (const sales of [600, 800, 1000, 733.33, 0.01]) {
      const m = coolerMonth(sales, a);
      expect(round2(m.sales - m.cogs - m.vms - m.processing - m.debit_fees - m.shrink - m.repair_reserve - m.restocking)).toBe(m.pre_fee_contribution);
      expect(m.operating_expenses).toBe(round2(m.vms + m.processing + m.debit_fees + m.shrink + m.repair_reserve + m.restocking));
    }
  });

  it("applies a customer-confirmed margin override through the COGS rate", () => {
    const { values } = resolveAssumptions({ cogs_rate: 0.4 });
    expect(coolerMonth(800, values).cogs).toBe(320);
    expect(coolerMonth(800, values).gross_profit).toBe(480);
  });

  it("charges a customer commission only on positive pre-commission contribution", () => {
    const { values } = resolveAssumptions({ location_fee_rate: 0.1 });
    expect(coolerMonth(800, values).location_fee).toBe(23.11);
    expect(coolerMonth(800, values).contribution).toBe(208.03);
    expect(coolerMonth(50, values).pre_fee_contribution).toBeLessThan(0);
    expect(coolerMonth(50, values).location_fee).toBe(0);
  });

  it("never deducts opening inventory from the monthly P&L", () => {
    const m = coolerMonth(800, a);
    expect(Object.keys(m)).not.toContain("opening_inventory");
    expect(m.pre_fee_contribution).toBe(231.14);
  });
});

describe("multi-machine aggregation", () => {
  it("VMS is per active machine while the percentage lines follow fleet sales", () => {
    const m = fleetMonth(8000, 10, a);
    expect(m.vms).toBe(400);
    expect(m.cogs).toBe(3600);
    expect(m.processing).toBe(468);
    expect(m.debit_fees).toBe(100.57);
    expect(m.pre_fee_contribution).toBe(2311.43);
  });
});

describe("amortizing loans", () => {
  it("SBA estimate: $55,000 over 10 years at 10% ≈ $726.83 per month", () => {
    expect(amortizedPayment(55_000, 0.1, 10)).toBeCloseTo(726.83, 1);
  });
  it("Alternative estimate: $55,000 over 5 years at 17% ≈ $1,366.89 per month", () => {
    expect(amortizedPayment(55_000, 0.17, 5)).toBeCloseTo(1366.89, 1);
  });
  it("schedules retire the balance exactly and sum to the payments made", () => {
    for (const c of FINANCING_CASES) {
      const s = loanSchedule(ILLUSTRATIVE_PRINCIPAL, c.annual_rate, c.term_years);
      expect(s.years).toHaveLength(c.term_years);
      expect(s.years[s.years.length - 1].ending_balance).toBe(0);
      expect(round2(s.years.reduce((t, y) => t + y.principal, 0))).toBe(ILLUSTRATIVE_PRINCIPAL);
      expect(s.total_paid).toBe(round2(s.total_interest + ILLUSTRATIVE_PRINCIPAL));
      expect(s.months).toHaveLength(12);
      expect(s.months[0].interest).toBe(round2((ILLUSTRATIVE_PRINCIPAL * c.annual_rate) / 12));
    }
  });
  it("handles zero principal and zero rate", () => {
    expect(amortizedPayment(0, 0.1, 10)).toBe(0);
    expect(amortizedPayment(1200, 0, 1)).toBe(100);
  });
  it("debt comparison carries the illustrative $55,000 payments next to the plan's own request", () => {
    const options = debtComparison(56_500, 27_000);
    expect(options.map((o) => o.illustrative.monthly_payment)).toEqual([726.83, 1366.89]);
    expect(options[0].plan.principal).toBe(56_500);
    expect(options[0].coverage_ratio).toBeCloseTo(27_000 / (options[0].plan.monthly_payment * 12), 2);
  });
});

describe("break-even", () => {
  it("per-cooler sales that cover VMS, and fleet sales that cover VMS plus debt", () => {
    const rate = variableContributionRate(a);
    expect(rate).toBeCloseTo(0.338929, 5);
    const be = breakEven(a, 10, 726.83);
    expect(be.sales_per_cooler_for_vms).toBe(round2(40 / rate));
    expect(be.fleet_sales_for_vms_and_debt).toBe(round2((400 + 726.83) / rate));
    expect(be.sales_per_cooler_for_vms_and_debt).toBe(round2((400 + 726.83) / rate / 10));
    // The contribution at the break-even sales level is zero (to the cent).
    expect(Math.abs(coolerMonth(be.sales_per_cooler_for_vms, a).pre_fee_contribution)).toBeLessThan(0.02);
  });
});

describe("rollout ramp", () => {
  it("places two machines a month for five months with 60/80/100% ramps", () => {
    const s = rolloutSchedule(10, DEFAULT_ROLLOUT);
    expect(deploymentMonths(10, DEFAULT_ROLLOUT)).toBe(5);
    expect(s.map((m) => m.machines_active)).toEqual([2, 4, 6, 8, 10, 10, 10, 10, 10, 10, 10, 10]);
    expect(s.map((m) => m.deployed_this_month)).toEqual([2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0]);
    // Month 1: 2 × 60%. Month 2: 2 × 80% + 2 × 60%. Month 3: 2×100% + 2×80% + 2×60%.
    expect(s.slice(0, 7).map((m) => m.sales_factor)).toEqual([1.2, 2.8, 4.8, 6.8, 8.8, 9.6, 10]);
  });
  it("five machines finish in three months; one machine is stabilized by month three", () => {
    expect(rolloutSchedule(5, DEFAULT_ROLLOUT).map((m) => m.machines_active).slice(0, 4)).toEqual([2, 4, 5, 5]);
    expect(rolloutSchedule(1, DEFAULT_ROLLOUT).map((m) => m.sales_factor).slice(0, 4)).toEqual([0.6, 0.8, 1, 1]);
  });
});

describe("scenario projection", () => {
  const input = { scenario: "base" as const, sales_per_cooler: 800, new_machines: 10, baseline: { machines: 0, monthly_sales: 0 }, a, rollout: DEFAULT_ROLLOUT, monthly_debt_service: 726.83, starting_cash: 10_000 };
  it("ramps Year 1 sales and stabilizes Years 2–5 at 12 × the fleet month", () => {
    const p = projectScenario(input);
    expect(p.months[0].sales).toBe(960);
    expect(p.months[5].sales).toBe(7680);
    expect(p.months[6].sales).toBe(8000);
    expect(p.year1.sales).toBe(round2(p.months.reduce((s, m) => s + m.sales, 0)));
    expect(p.years_2_to_5.map((y) => y.sales)).toEqual([96_000, 96_000, 96_000, 96_000]);
    expect(p.years_2_to_5[0].contribution).toBe(round2(fleetMonth(8000, 10, a).contribution * 12));
    expect(p.year1.debt_service).toBe(8721.96);
  });
  it("spends opening inventory as machines deploy and tracks cumulative cash from the working-capital allowance", () => {
    const p = projectScenario(input);
    expect(p.months.map((m) => m.opening_inventory_outlay)).toEqual([1000, 1000, 1000, 1000, 1000, 0, 0, 0, 0, 0, 0, 0]);
    expect(p.months[0].cumulative_cash).toBe(round2(10_000 + p.months[0].contribution - 726.83 - 1000));
    expect(round2(p.months.reduce((s, m) => s + m.opening_inventory_outlay, 0))).toBe(5000);
    expect(p.cash_low_point).toBe(Math.min(...p.months.map((m) => m.cumulative_cash)));
  });
  it("keeps an existing operator's baseline earning from month one without ramping it", () => {
    const p = projectScenario({ ...input, new_machines: 5, baseline: { machines: 4, monthly_sales: 3000 } });
    expect(p.months[0].baseline_sales).toBe(3000);
    expect(p.months[0].new_machine_sales).toBe(960);
    expect(p.months[0].machines_active).toBe(6);
    expect(p.stabilized_month.sales).toBe(7000);
  });
});
