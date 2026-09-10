import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { pdfSafeInline } from "@/lib/pdfSafeText";
import { usd } from "../sections";
import { BRAND, type DocTable, type PlanDocument } from "./document";

/**
 * PDF: the same narrative and tables as the Word file, laid out with
 * pdf-lib (already a dependency). Letter pages, Helvetica, a green brand
 * rule on every page, page numbers, and a repeated disclaimer footer.
 */
const PAGE = { w: 612, h: 792, margin: 54 };
const GREEN = rgb(0x16 / 255, 0xa3 / 255, 0x4a / 255);
const BLACK = rgb(0.07, 0.07, 0.07);
const GRAY = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.82, 0.84, 0.86);

interface Writer {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  font: PDFFont;
  bold: PDFFont;
  pageNo: number;
}

function newPage(w: Writer): void {
  w.page = w.doc.addPage([PAGE.w, PAGE.h]);
  w.pageNo += 1;
  w.page.drawRectangle({ x: 0, y: PAGE.h - 6, width: PAGE.w, height: 6, color: GREEN });
  w.page.drawText(BRAND.name.toUpperCase(), { x: PAGE.margin, y: PAGE.h - 30, size: 8, font: w.bold, color: GREEN });
  w.page.drawText(`${BRAND.tagline} · page ${w.pageNo}`, { x: PAGE.w - PAGE.margin - 140, y: PAGE.h - 30, size: 8, font: w.font, color: GRAY });
  w.page.drawText("Illustrative projections, not guaranteed income. Financing decisions belong to the lender.", { x: PAGE.margin, y: 28, size: 7, font: w.font, color: GRAY });
  w.y = PAGE.h - 60;
}

function ensure(w: Writer, needed: number): void {
  if (w.y - needed < 48) newPage(w);
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = pdfSafeInline(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function text(w: Writer, body: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; after?: number } = {}): void {
  const size = opts.size ?? 10;
  const font = opts.bold ? w.bold : w.font;
  const lines = wrap(body, font, size, PAGE.w - PAGE.margin * 2);
  for (const l of lines) {
    ensure(w, size * 1.4);
    w.page.drawText(l, { x: PAGE.margin, y: w.y, size, font, color: opts.color ?? BLACK });
    w.y -= size * 1.4;
  }
  w.y -= opts.after ?? 6;
}

function cellText(v: string | number, money: boolean): string {
  if (typeof v === "string") return v;
  return money ? usd(v) : String(v);
}

function table(w: Writer, t: DocTable): void {
  const size = t.columns.length > 7 ? 6.5 : 8;
  const width = PAGE.w - PAGE.margin * 2;
  const first = t.columns.length <= 5 ? width * 0.4 : Math.min(width * 0.3, Math.max(90, width / t.columns.length));
  const rest = (width - first) / Math.max(1, t.columns.length - 1);
  const colX = (i: number) => PAGE.margin + (i === 0 ? 0 : first + (i - 1) * rest);
  const colW = (i: number) => (i === 0 ? first : rest);
  const lineH = size * 1.25;
  ensure(w, 40 + lineH * 6);
  text(w, t.title, { size: 11, bold: true, after: 4 });
  // Header cells may wrap to two lines; body cells stay on one line.
  const drawRow = (cells: Array<string | number>, header: boolean) => {
    const font = header ? w.bold : w.font;
    const lines = cells.map((c, i) => wrap(cellText(c, t.money_columns.includes(i)), font, size, colW(i) - 6).slice(0, header ? 2 : 1));
    const rowH = lineH * Math.max(1, ...lines.map((l) => l.length)) + size * 0.75;
    ensure(w, rowH);
    if (header) w.page.drawRectangle({ x: PAGE.margin, y: w.y - rowH + 4, width, height: rowH, color: GREEN });
    lines.forEach((ls, i) => {
      ls.forEach((l, li) => {
        const tw = font.widthOfTextAtSize(l, size);
        const x = i === 0 ? colX(i) + 3 : Math.max(colX(i) + 3, colX(i) + colW(i) - 3 - tw);
        w.page.drawText(l, { x, y: w.y - size * 0.95 - li * lineH, size, font, color: header ? rgb(1, 1, 1) : BLACK });
      });
    });
    w.y -= rowH;
    w.page.drawLine({ start: { x: PAGE.margin, y: w.y + 4 }, end: { x: PAGE.margin + width, y: w.y + 4 }, thickness: 0.5, color: LINE });
  };
  drawRow(t.columns, true);
  for (const r of t.rows) drawRow(r, false);
  w.y -= 6;
  if (t.note) text(w, t.note, { size: 7.5, color: GRAY, after: 10 });
  else w.y -= 8;
}

export async function buildPdf(d: PlanDocument): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${BRAND.name} — ${d.title}`);
  doc.setAuthor(BRAND.name);
  doc.setSubject(`${d.plan_number} v${d.version}`);
  doc.setProducer(`${BRAND.name} plan engine ${d.engine_version}`);
  const w: Writer = { doc, page: undefined as unknown as PDFPage, y: 0, font: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold), pageNo: 0 };
  newPage(w);
  text(w, d.title, { size: 20, bold: true, after: 2 });
  text(w, d.subtitle, { size: 10, color: GRAY });
  text(w, `Prepared for ${d.business_name} · generated ${d.generated_at.slice(0, 10)} · calculation engine ${d.engine_version}`, { size: 8, color: GRAY });
  for (const t of d.disclaimers) text(w, t, { size: 8, color: GRAY, after: 2 });
  w.y -= 8;
  for (const s of d.sections) {
    ensure(w, 60);
    text(w, `${s.number}. ${s.title}`, { size: 13, bold: true, color: GREEN, after: 4 });
    for (const p of s.paragraphs) text(w, p);
  }
  newPage(w);
  text(w, "Financial tables", { size: 16, bold: true, color: GREEN });
  for (const t of d.tables) table(w, t);
  return doc.save();
}

export const PDF_CONTENT_TYPE = "application/pdf";
