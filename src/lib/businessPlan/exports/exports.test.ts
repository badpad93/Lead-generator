import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { ENGINE_VERSION } from "../assumptions";
import { defaultInputs, buildPlanView } from "../plan";
import { CATALOG } from "../__testutils__/catalogFixture";
import { mergeProfile, EMPTY_PROFILE } from "../profile";
import { SECTION_TITLES } from "../sections";
import type { PlanRow } from "../store";
import { buildPlanDocument, exportFilename, FILE_PROVIDERS, renderPlanExport } from "./index";
import { buildDocxDocumentXml } from "./docx";
import { readZip } from "./zip";
import { XLSX_SHEET_NAMES } from "./xlsx";

const inputs = { ...defaultInputs(), confirmed: true, profile: mergeProfile(EMPTY_PROFILE, { business_name: "Sunrise Vending", territory: "Tampa Bay", weekly_hours_available: 20 }) };
const view = buildPlanView(inputs, CATALOG);
const plan: PlanRow = { id: "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11", user_id: "11111111-1111-4111-8111-000000000001", thread_id: null, plan_number: "VP-260910-0007", version: 3, engine_version: ENGINE_VERSION, status: "confirmed", package: "ten_ten_ten", website_included: true, website_decision: "default", inputs, catalog_snapshot: CATALOG, outputs: view, quote_id: null, financing_status: "none", financing_application_id: null, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z" };
const ctx = { quote: null, financing_status: "none" as const };
const doc = buildPlanDocument(plan, ctx, new Date("2026-09-10T12:00:00Z"));
const OUT = process.env.PLAN_EXPORT_OUT_DIR;

const tag = (inner: string, name: string): string | null => inner.match(new RegExp(`<${name}[^>]*>(.*?)</${name}>`))?.[1] ?? null;

function cells(sheetXml: string): Map<string, { f: string | null; v: string | null; t: string | null }> {
  const out = new Map<string, { f: string | null; v: string | null; t: string | null }>();
  for (const m of sheetXml.matchAll(/<c r="([A-Z]+\d+)"([^>]*)>(.*?)<\/c>/g)) out.set(m[1], { f: tag(m[3], "f"), v: tag(m[3], "v"), t: tag(m[3], "t") });
  return out;
}

describe("canonical export document", () => {
  it("derives sections, tables, and projections from the stored plan with the same engine", () => {
    expect(doc.sections.map((s) => s.title)).toEqual([...SECTION_TITLES]);
    expect(doc.tables.map((t) => t.key)).toEqual(["assumptions", "sources_uses", "per_cooler", "scenarios", "monthly_conservative", "monthly_base", "monthly_growth", "annual_conservative", "annual_base", "annual_growth", "pl_conservative", "pl_base", "pl_growth", "debt", "break_even", "rollout"]);
    const base = doc.projections.find((p) => p.scenario === "base")!;
    expect(base.year1.contribution).toBe(view.scenarios[1].year1.contribution);
    expect(doc.monthly_debt_service).toBe(view.financing.monthly_debt_service);
    expect(doc.business_name).toBe("Sunrise Vending");
  });
  it("uses a safe filename built from the plan number and version only", () => {
    expect(exportFilename(plan, "pdf")).toBe("VendingConnector-BusinessPlan-VP-260910-0007-v3.pdf");
    expect(exportFilename({ ...plan, plan_number: "../x;evil\"" }, "xlsx")).toBe("VendingConnector-BusinessPlan-xevil-v3.xlsx");
  });
  it("carries no internal, QuickBooks, or sensitive fields", () => {
    const json = JSON.stringify(doc);
    expect(json).not.toMatch(/qb_|quickbooks|SECRET|unit_cost|supplier|user_id|credit_score|date_of_birth|ssn|bank/i);
  });
});

const xlsxBytes = FILE_PROVIDERS.xlsx.render(doc);
const sheetCells = async (n: number) => cells(readZip(Buffer.from(await xlsxBytes)).get(`xl/worksheets/sheet${n}.xml`)!.toString());
const formulaCellsOf = (sheet: number, all: ReturnType<typeof cells>) => [...all].filter(([, c]) => c.f).map(([ref, c]) => ({ ref: `${sheet}:${ref}`, v: c.v }));

describe("Excel export", () => {
  const bytes = xlsxBytes;
  it("is a valid stored OOXML package with the expected sheets", async () => {
    const zip = readZip(Buffer.from(await bytes));
    expect([...zip.keys()]).toContain("[Content_Types].xml");
    expect([...zip.keys()]).toContain("xl/workbook.xml");
    const wb = zip.get("xl/workbook.xml")!.toString();
    for (const n of XLSX_SHEET_NAMES) expect(wb).toContain(`name="${n.replace("&", "&amp;")}"`);
    expect(zip.size).toBe(5 + XLSX_SHEET_NAMES.length);
    if (OUT) {
      mkdirSync(OUT, { recursive: true });
      writeFileSync(join(OUT, exportFilename(plan, "xlsx")), Buffer.from(await bytes));
    }
  });
  it("Inputs cells hold the assumptions and Per-Cooler formulas reference them", async () => {
    const inputs = await sheetCells(2);
    expect(inputs.get("B4")?.v).toBe("800"); // sales_base is the second assumption → row 4
    expect(inputs.get("B7")?.v).toBe("0.45");
    const per = await sheetCells(3);
    expect(per.get("C3")?.f).toBe("Inputs!$B$4");
    expect(per.get("C4")?.f).toBe("ROUND(C3*Inputs!$B$7,2)");
    expect(per.get("C8")?.f).toContain("Inputs!$B$6"); // debit fee formula uses average transaction
  });
  it("Per-Cooler cached values equal the engine's base scenario", async () => {
    const per = await sheetCells(3);
    const base = view.scenarios[1].per_cooler_month;
    expect(Number(per.get("C4")?.v)).toBe(base.cogs);
    expect(Number(per.get("C12")?.v)).toBe(base.pre_fee_contribution);
    expect(Number(per.get("C14")?.v)).toBe(base.contribution);
  });
  it("every formula cell on the calculation sheets carries a finite cached value", async () => {
    const sheets = await Promise.all([3, 4, 5, 6].map(async (n) => formulaCellsOf(n, await sheetCells(n))));
    const formulaCells = sheets.flat();
    expect(formulaCells.length).toBeGreaterThan(60);
    for (const c of formulaCells) expect(Number.isFinite(Number(c.v)), c.ref).toBe(true);
  });
  it("Year 1 rows reconcile with the base projection and the debt sheet uses PMT", async () => {
    const zip = readZip(Buffer.from(await bytes));
    const y1 = cells(zip.get("xl/worksheets/sheet4.xml")!.toString());
    const base = doc.projections.find((p) => p.scenario === "base")!;
    base.months.forEach((m, i) => {
      const r = i + 3;
      expect(Number(y1.get(`E${r}`)?.v)).toBe(m.sales);
      expect(Number(y1.get(`H${r}`)?.v)).toBe(m.contribution);
      expect(Number(y1.get(`L${r}`)?.v)).toBe(m.cumulative_cash);
      expect(y1.get(`L${r}`)?.f).toContain(i === 0 ? "Inputs!" : `L${r - 1}`);
    });
    expect(Number(y1.get("E15")?.v)).toBe(base.year1.sales);
    const debt = cells(zip.get("xl/worksheets/sheet6.xml")!.toString());
    expect(debt.get("B4")?.f).toMatch(/PMT\(Inputs!\$B\$\d+\/12,Inputs!\$B\$\d+\*12,-Inputs!\$B\$\d+\)/);
    expect(Number(debt.get("B4")?.v)).toBe(view.financing.monthly_debt_service);
    expect(Number(debt.get("B7")?.v)).toBe(726.83);
  });
});

describe("Word export", () => {
  it("contains the branded title, all 21 sections, the tables, and no internal fields", async () => {
    const xml = buildDocxDocumentXml(doc);
    expect(xml).toContain("VENDING CONNECTOR");
    for (const t of SECTION_TITLES) expect(xml).toContain(t.replace(/&/g, "&amp;"));
    for (const t of doc.tables) expect(xml).toContain(t.title.replace(/&/g, "&amp;").replace(/—/g, "—"));
    expect(xml).toContain("$726.83");
    expect(xml).not.toMatch(/qb_|SECRET|user_id/);
    const bytes = await FILE_PROVIDERS.docx.render(doc);
    const zip = readZip(Buffer.from(bytes));
    expect([...zip.keys()].sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "word/_rels/document.xml.rels", "word/document.xml", "word/styles.xml"]);
    if (OUT) writeFileSync(join(OUT, exportFilename(plan, "docx")), Buffer.from(bytes));
  });
});

describe("PDF export", () => {
  it("renders a multi-page branded PDF that pdf-lib can reload", async () => {
    const bytes = await FILE_PROVIDERS.pdf.render(doc);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getTitle()).toContain("Vending Connector");
    expect(pdf.getAuthor()).toBe("Vending Connector");
    if (OUT) writeFileSync(join(OUT, exportFilename(plan, "pdf")), Buffer.from(bytes));
  });
});

describe("renderPlanExport", () => {
  it("returns the right content type and filename per format", async () => {
    for (const [format, type] of [["xlsx", "spreadsheetml.sheet"], ["docx", "wordprocessingml.document"], ["pdf", "application/pdf"]] as const) {
      const r = await renderPlanExport(plan, format, ctx, new Date("2026-09-10T00:00:00Z"));
      expect(r.contentType).toContain(type);
      expect(r.filename.endsWith(`.${format}`)).toBe(true);
      expect(r.bytes.length).toBeGreaterThan(1000);
    }
  });
});
