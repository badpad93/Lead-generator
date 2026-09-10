import { DEFAULT_ASSUMPTIONS, FINANCING_CASES, type Assumptions } from "../assumptions";
import type { FleetMonth } from "../engine";
import { BRAND, PL_LINES, type DocTable, type PlanDocument } from "./document";
import { buildZip, XML_HEADER, xmlEscape } from "./zip";

/**
 * Excel workbook: an Inputs sheet whose highlighted cells drive live
 * formulas on the Per-Cooler, Year 1, and Years 2–5 sheets (each formula
 * carries the engine's value as its cached result, so the file reconciles
 * with the chat and the other exports even before recalculation), a debt
 * sheet with PMT formulas, and value sheets for the remaining tables.
 */
type CellValue = string | number | { f: string; v: number };
interface Cell {
  ref: string;
  value: CellValue;
  style?: number;
}

/** styles.xml cellXfs indexes. */
const S = { text: 0, bold: 1, money: 2, percent: 3, inputMoney: 4, inputPercent: 5, title: 6, calcMoney: 7, int: 8, inputInt: 9 } as const;

const ASSUMPTION_KEYS = Object.keys(DEFAULT_ASSUMPTIONS) as Array<keyof Assumptions>;
const INPUT_ROW: Record<string, number> = Object.fromEntries(ASSUMPTION_KEYS.map((k, i) => [k, i + 3]));
const EXTRA_INPUTS = ["machines", "baseline_machines", "baseline_sales", "working_capital", "cash_contribution", "financing_request", "loan_rate", "loan_years", "ramp_1", "ramp_2", "ramp_3"] as const;
for (const [i, k] of EXTRA_INPUTS.entries()) INPUT_ROW[k] = ASSUMPTION_KEYS.length + 5 + i;
const IN = (k: string) => `Inputs!$B$${INPUT_ROW[k]}`;

export function colLetter(i: number): string {
  let s = "";
  let n = i;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function cellXml(c: Cell): string {
  const st = c.style ? ` s="${c.style}"` : "";
  if (typeof c.value === "string") return `<c r="${c.ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEscape(c.value)}</t></is></c>`;
  if (typeof c.value === "number") return `<c r="${c.ref}"${st}><v>${c.value}</v></c>`;
  return `<c r="${c.ref}"${st}><f>${xmlEscape(c.value.f)}</f><v>${c.value.v}</v></c>`;
}

function sheetXml(rows: Cell[][], widths: number[]): string {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const body = rows.map((cells, i) => `<row r="${i + 1}">${cells.map(cellXml).join("")}</row>`).join("");
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`;
}

/** Rows of a value table: header + data, money columns styled. */
function tableRows(t: DocTable, startRow: number): Cell[][] {
  const header: Cell[] = [{ ref: `A${startRow}`, value: t.title, style: S.bold }];
  const cols: Cell[] = t.columns.map((c, i) => ({ ref: `${colLetter(i)}${startRow + 1}`, value: c, style: S.bold }));
  const styleFor = (v: string | number, ci: number): number => {
    if (typeof v !== "number") return S.text;
    return t.money_columns.includes(ci) ? S.money : S.int;
  };
  const data: Cell[][] = t.rows.map((r, ri) => r.map((v, ci) => ({ ref: `${colLetter(ci)}${startRow + 2 + ri}`, value: v, style: styleFor(v, ci) })));
  const note: Cell[][] = t.note ? [[{ ref: `A${startRow + 2 + t.rows.length}`, value: t.note }]] : [];
  return [header, cols, ...data, ...note];
}

function valueSheet(tables: DocTable[]): string {
  const rows: Cell[][] = [];
  for (const t of tables) {
    rows.push(...tableRows(t, rows.length + 1), []);
  }
  return sheetXml(rows, [44, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16]);
}

function coverSheet(d: PlanDocument): string {
  const rows: Cell[][] = [
    [{ ref: "A1", value: `${BRAND.name} — ${d.title}`, style: S.title }],
    [{ ref: "A2", value: d.subtitle }],
    [{ ref: "A3", value: `Prepared for: ${d.business_name}` }],
    [{ ref: "A4", value: `Generated ${d.generated_at.slice(0, 10)} · calculation engine ${d.engine_version}` }],
    [],
    [{ ref: "A6", value: "How to use this workbook", style: S.bold }],
    [{ ref: "A7", value: "Green cells on the Inputs sheet are the assumptions. Change them and the Per-Cooler, Year 1, Years 2-5, and Debt sheets recalculate. Every other sheet holds the values from the saved plan." }],
    [],
    ...d.disclaimers.map((t, i) => [{ ref: `A${9 + i}`, value: t }]),
  ];
  return sheetXml(rows, [120]);
}

function inputsSheet(d: PlanDocument): string {
  const v = d.view;
  const a = Object.fromEntries(v.assumptions.map((x) => [x.key, x]));
  const rows: Cell[][] = [[{ ref: "A1", value: "Inputs (green cells drive the formulas)", style: S.title }], [{ ref: "A2", value: "Assumption", style: S.bold }, { ref: "B2", value: "Value", style: S.bold }, { ref: "C2", value: "Source", style: S.bold }]];
  for (const k of ASSUMPTION_KEYS) {
    const x = a[k];
    rows.push([{ ref: `A${INPUT_ROW[k]}`, value: x.label }, { ref: `B${INPUT_ROW[k]}`, value: x.value, style: x.format === "percent" ? S.inputPercent : S.inputMoney }, { ref: `C${INPUT_ROW[k]}`, value: x.source === "customer" ? "Customer-supplied" : "Vending Connector default" }]);
  }
  const fc = FINANCING_CASES.find((c) => c.key === v.financing.selected_case) ?? FINANCING_CASES[0];
  const extras: Array<[string, string, number, number]> = [
    ["machines", "New machines in this package", v.machines, S.inputInt],
    ["baseline_machines", "Existing machines (baseline)", v.baseline.machines, S.inputInt],
    ["baseline_sales", "Existing monthly sales (baseline)", v.baseline.monthly_sales, S.inputMoney],
    ["working_capital", "Working-capital allowance (starting cash)", v.sources_and_uses.working_capital_allowance, S.calcMoney],
    ["cash_contribution", "Owner cash contribution", v.sources_and_uses.owner_cash, S.inputMoney],
    ["financing_request", "Financing request", v.sources_and_uses.financing_request, S.calcMoney],
    ["loan_rate", `Loan rate (${fc.label})`, fc.annual_rate, S.inputPercent],
    ["loan_years", `Loan term in years (${fc.label})`, fc.term_years, S.inputInt],
    ["ramp_1", "Ramp: first active month share", v.rollout.ramp[0], S.inputPercent],
    ["ramp_2", "Ramp: second active month share", v.rollout.ramp[1], S.inputPercent],
    ["ramp_3", "Ramp: third month onward", v.rollout.ramp[2], S.inputPercent],
  ];
  for (const [k, label, value, style] of extras) rows.push([{ ref: `A${INPUT_ROW[k]}`, value: label }, { ref: `B${INPUT_ROW[k]}`, value, style }, { ref: `C${INPUT_ROW[k]}`, value: style === S.calcMoney ? "Calculated" : "Plan input" }]);
  rows.push([], [{ ref: `A${INPUT_ROW.ramp_3 + 2}`, value: "Rates are fractions of sales. Machine contribution is before company overhead, taxes, owner compensation, and debt service." }]);
  return sheetXml(rows, [52, 18, 26]);
}

/** P&L formulas for one column given a sales cell and a machines cell; returns [f, v] pairs in PL_LINES order. */
interface PlColumn {
  salesRef: string;
  machinesRef: string;
  month: FleetMonth;
  col: string;
  firstRow: number;
}

function plFormulas({ salesRef, machinesRef, month: m, col, firstRow }: PlColumn): Cell[] {
  const r = (i: number) => `${col}${firstRow + i}`;
  const f: Record<keyof FleetMonth, string> = {
    sales: salesRef,
    cogs: `ROUND(${r(0)}*${IN("cogs_rate")},2)`,
    gross_profit: `ROUND(${r(0)}-${r(1)},2)`,
    vms: `ROUND(${machinesRef}*${IN("vms_fee_per_cooler")},2)`,
    processing: `ROUND(${r(0)}*${IN("processing_rate")},2)`,
    debit_fees: `ROUND(${r(0)}/${IN("average_transaction")}*${IN("debit_share")}*${IN("debit_fee")},2)`,
    shrink: `ROUND(${r(0)}*${IN("shrink_rate")},2)`,
    repair_reserve: `ROUND(${r(0)}*${IN("repair_reserve_rate")},2)`,
    restocking: `ROUND(${r(0)}*${IN("restocking_rate")},2)`,
    pre_fee_contribution: `ROUND(${r(0)}-${r(1)}-${r(3)}-${r(4)}-${r(5)}-${r(6)}-${r(7)}-${r(8)},2)`,
    location_fee: `ROUND(MAX(0,${r(9)})*${IN("location_fee_rate")},2)`,
    location_fee_stress: `ROUND(MAX(0,${r(9)})*0.1,2)`,
    contribution: `ROUND(${r(9)}-${r(10)},2)`,
    contribution_after_stress: `ROUND(${r(9)}-ROUND(MAX(0,${r(9)})*0.1,2),2)`,
    machines_active: machinesRef,
    transactions: `ROUND(${r(0)}/${IN("average_transaction")},2)`,
    debit_transactions: `ROUND(${r(0)}/${IN("average_transaction")}*${IN("debit_share")},2)`,
    operating_expenses: `ROUND(${r(3)}+${r(4)}+${r(5)}+${r(6)}+${r(7)}+${r(8)},2)`,
  };
  return PL_LINES.map((l, i) => ({ ref: r(i), value: { f: f[l.key], v: m[l.key] }, style: S.calcMoney }));
}

const SALES_KEY: Record<string, keyof Assumptions> = { conservative: "sales_conservative", base: "sales_base", growth: "sales_growth" };

function perCoolerSheet(d: PlanDocument): string {
  const first = 3;
  const rows: Cell[][] = [[{ ref: "A1", value: "Per-machine unit economics — one stabilized cooler, per month (formulas)", style: S.title }], [{ ref: "A2", value: "Line", style: S.bold }, ...d.view.scenarios.map((s, i) => ({ ref: `${colLetter(i + 1)}2`, value: s.scenario[0].toUpperCase() + s.scenario.slice(1), style: S.bold }))]];
  const labels: Cell[] = PL_LINES.map((l, i) => ({ ref: `A${first + i}`, value: l.label }));
  const columns = d.view.scenarios.map((s, i) => plFormulas({ salesRef: IN(SALES_KEY[s.scenario]), machinesRef: "1", month: s.per_cooler_month, col: colLetter(i + 1), firstRow: first }));
  for (let i = 0; i < PL_LINES.length; i += 1) rows.push([labels[i], ...columns.map((c) => c[i])]);
  rows.push([], [{ ref: `A${first + PL_LINES.length + 1}`, value: "Break-even monthly sales per cooler (covers VMS)" }, { ref: `B${first + PL_LINES.length + 1}`, value: { f: `ROUND(${IN("vms_fee_per_cooler")}/(1-${IN("cogs_rate")}-${IN("processing_rate")}-${IN("shrink_rate")}-${IN("repair_reserve_rate")}-${IN("restocking_rate")}-${IN("debit_share")}*${IN("debit_fee")}/${IN("average_transaction")}),2)`, v: d.view.scenarios[1].break_even.sales_per_cooler_for_vms }, style: S.calcMoney }]);
  return sheetXml(rows, [44, 18, 18, 18]);
}

function year1Sheet(d: PlanDocument): string {
  const base = d.projections.find((p) => p.scenario === "base") ?? d.projections[0];
  const head = ["Month", "Placed", "Active (new)", "Ramp factor", "Sales", "COGS", "Operating costs", "Machine contribution", "Debt service", "Opening inventory", "Net cash flow", "Cumulative cash"];
  const rows: Cell[][] = [[{ ref: "A1", value: "Monthly Year 1 forecast — base scenario (formulas; ramp factors from the deployment schedule)", style: S.title }], head.map((h, i) => ({ ref: `${colLetter(i)}2`, value: h, style: S.bold }))];
  const debtRef = "Debt!$B$4";
  base.months.forEach((m, i) => {
    const r = i + 3;
    const factor = Math.round(((m.new_machine_sales / (base.sales_per_cooler || 1)) || 0) * 1000) / 1000;
    const sales = `ROUND(D${r}*${IN("sales_base")}+${IN("baseline_sales")},2)`;
    const cogs = `ROUND(E${r}*${IN("cogs_rate")},2)`;
    const opex = `ROUND((C${r}+${IN("baseline_machines")})*${IN("vms_fee_per_cooler")}+ROUND(E${r}*${IN("processing_rate")},2)+ROUND(E${r}/${IN("average_transaction")}*${IN("debit_share")}*${IN("debit_fee")},2)+ROUND(E${r}*${IN("shrink_rate")},2)+ROUND(E${r}*${IN("repair_reserve_rate")},2)+ROUND(E${r}*${IN("restocking_rate")},2),2)`;
    const contribution = `ROUND(E${r}-F${r}-G${r}-ROUND(MAX(0,E${r}-F${r}-G${r})*${IN("location_fee_rate")},2),2)`;
    rows.push([
      { ref: `A${r}`, value: m.month, style: S.int },
      { ref: `B${r}`, value: m.deployed_this_month, style: S.int },
      { ref: `C${r}`, value: m.machines_active - d.view.baseline.machines, style: S.int },
      { ref: `D${r}`, value: factor },
      { ref: `E${r}`, value: { f: sales, v: m.sales }, style: S.calcMoney },
      { ref: `F${r}`, value: { f: cogs, v: m.cogs }, style: S.calcMoney },
      { ref: `G${r}`, value: { f: opex, v: m.operating_expenses }, style: S.calcMoney },
      { ref: `H${r}`, value: { f: contribution, v: m.contribution }, style: S.calcMoney },
      { ref: `I${r}`, value: { f: debtRef, v: m.debt_service }, style: S.calcMoney },
      { ref: `J${r}`, value: { f: `ROUND(B${r}*${IN("opening_inventory_per_cooler")},2)`, v: m.opening_inventory_outlay }, style: S.calcMoney },
      { ref: `K${r}`, value: { f: `ROUND(H${r}-I${r}-J${r},2)`, v: m.net_cash_flow }, style: S.calcMoney },
      { ref: `L${r}`, value: { f: i === 0 ? `ROUND(${IN("working_capital")}+K${r},2)` : `ROUND(L${r - 1}+K${r},2)`, v: m.cumulative_cash }, style: S.calcMoney },
    ]);
  });
  const t = base.months.length + 3;
  const sumOf = (k: "opening_inventory_outlay" | "net_cash_flow") => Math.round(base.months.reduce((s, m) => s + m[k], 0) * 100) / 100;
  const totals: Array<[string, number]> = [["E", base.year1.sales], ["F", base.year1.cogs], ["G", base.year1.operating_expenses], ["H", base.year1.contribution], ["I", base.year1.debt_service], ["J", sumOf("opening_inventory_outlay")], ["K", sumOf("net_cash_flow")]];
  rows.push([{ ref: `A${t}`, value: "Year 1 total", style: S.bold }, ...totals.map(([c, v]) => ({ ref: `${c}${t}`, value: { f: `ROUND(SUM(${c}3:${c}${t - 1}),2)`, v }, style: S.calcMoney }))]);
  return sheetXml(rows, [10, 8, 12, 12, 14, 14, 16, 20, 14, 16, 14, 16]);
}

function yearsSheet(d: PlanDocument): string {
  const base = d.projections.find((p) => p.scenario === "base") ?? d.projections[0];
  const y2 = base.years_2_to_5[0];
  const rows: Cell[][] = [[{ ref: "A1", value: "Annual Years 2–5 forecast — base scenario, stabilized (formulas)", style: S.title }], [{ ref: "A2", value: "Line", style: S.bold }, { ref: "B2", value: "Stabilized month", style: S.bold }, { ref: "C2", value: "Per year (Years 2–5)", style: S.bold }]];
  const month = plFormulas({ salesRef: `ROUND(${IN("machines")}*${IN("sales_base")}+${IN("baseline_sales")},2)`, machinesRef: `(${IN("machines")}+${IN("baseline_machines")})`, month: base.stabilized_month, col: "B", firstRow: 3 });
  PL_LINES.forEach((l, i) => rows.push([{ ref: `A${3 + i}`, value: l.label }, month[i], { ref: `C${3 + i}`, value: { f: `ROUND(B${3 + i}*12,2)`, v: y2[l.key] }, style: S.calcMoney }]));
  const n = 3 + PL_LINES.length;
  rows.push([{ ref: `A${n}`, value: "Annual debt service" }, { ref: `B${n}`, value: { f: "Debt!$B$4", v: d.monthly_debt_service }, style: S.calcMoney }, { ref: `C${n}`, value: { f: `ROUND(B${n}*12,2)`, v: y2.debt_service }, style: S.calcMoney }]);
  rows.push([{ ref: `A${n + 1}`, value: "Net after debt service", style: S.bold }, { ref: `B${n + 1}`, value: { f: `ROUND(B${n - 2}-B${n},2)`, v: Math.round((base.stabilized_month.contribution - d.monthly_debt_service) * 100) / 100 }, style: S.calcMoney }, { ref: `C${n + 1}`, value: { f: `ROUND(C${n - 2}-C${n},2)`, v: y2.net_after_debt_service }, style: S.calcMoney }]);
  return sheetXml(rows, [44, 20, 22]);
}

function debtSheet(d: PlanDocument): string {
  const v = d.view;
  const sel = v.financing.options.find((o) => o.case === v.financing.selected_case) ?? v.financing.options[0];
  const rows: Cell[][] = [
    [{ ref: "A1", value: "Debt schedules (PMT formulas; the lender sets actual rates, terms, eligibility, and approval)", style: S.title }],
    [{ ref: "A3", value: `Monthly payment on the plan's financing request (${sel.label})`, style: S.bold }],
    [{ ref: "A4", value: "Payment" }, { ref: "B4", value: { f: `IF(${IN("financing_request")}<=0,0,ROUND(PMT(${IN("loan_rate")}/12,${IN("loan_years")}*12,-${IN("financing_request")}),2))`, v: sel.plan.monthly_payment }, style: S.calcMoney }],
  ];
  let r = 6;
  for (const o of v.financing.options) {
    rows.push([{ ref: `A${r}`, value: `${o.label}: ${o.term_years} years at ${Math.round(o.annual_rate * 10000) / 100}%`, style: S.bold }]);
    rows.push([{ ref: `A${r + 1}`, value: "Illustrative $55,000 payment" }, { ref: `B${r + 1}`, value: { f: `ROUND(PMT(${o.annual_rate}/12,${o.term_years * 12},-${o.illustrative.principal}),2)`, v: o.illustrative.monthly_payment }, style: S.calcMoney }]);
    rows.push([{ ref: `A${r + 2}`, value: "This plan's request payment" }, { ref: `B${r + 2}`, value: { f: `IF(${IN("financing_request")}<=0,0,ROUND(PMT(${o.annual_rate}/12,${o.term_years * 12},-${IN("financing_request")}),2))`, v: o.plan.monthly_payment }, style: S.calcMoney }]);
    rows.push(["Year", "Payments", "Interest", "Principal", "Ending balance"].map((h, i) => ({ ref: `${colLetter(i)}${r + 3}`, value: h, style: S.bold })));
    o.plan.years.forEach((y, i) => rows.push([{ ref: `A${r + 4 + i}`, value: y.year, style: S.int }, { ref: `B${r + 4 + i}`, value: y.payments, style: S.money }, { ref: `C${r + 4 + i}`, value: y.interest, style: S.money }, { ref: `D${r + 4 + i}`, value: y.principal, style: S.money }, { ref: `E${r + 4 + i}`, value: y.ending_balance, style: S.money }]));
    r += 5 + o.plan.years.length;
  }
  return sheetXml(rows, [48, 16, 16, 16, 16]);
}

const STYLES = `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF${BRAND.green}"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/></patternFill></fill></fills><borders count="1"><border/></borders><cellXfs count="10"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="2" borderId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="165" fontId="0" fillId="2" borderId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="3" borderId="0" applyNumberFormat="1" applyFill="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="2" borderId="0" applyNumberFormat="1" applyFill="1"/></cellXfs></styleSheet>`;

export const XLSX_SHEET_NAMES = ["Cover", "Inputs", "Per-Cooler", "Year 1", "Years 2-5", "Debt", "Scenarios", "Sources & Uses", "Tables"] as const;

export function buildXlsx(d: PlanDocument): Buffer {
  const byKey = (k: string) => d.tables.filter((t) => t.key === k || t.key.startsWith(`${k}_`));
  const sheets = [
    coverSheet(d),
    inputsSheet(d),
    perCoolerSheet(d),
    year1Sheet(d),
    yearsSheet(d),
    debtSheet(d),
    valueSheet([...byKey("scenarios"), ...byKey("break_even")]),
    valueSheet(byKey("sources_uses")),
    valueSheet([...byKey("assumptions"), ...byKey("per_cooler"), ...byKey("monthly"), ...byKey("annual"), ...byKey("pl"), ...byKey("debt"), ...byKey("rollout")]),
  ];
  const workbook = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${XLSX_SHEET_NAMES.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets><calcPr fullCalcOnLoad="1"/></workbook>`;
  const rels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const types = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;
  const rootRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  return buildZip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: rels },
    { name: "xl/styles.xml", data: STYLES },
    ...sheets.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xml })),
  ]);
}

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
