import { pct, usd } from "../sections";
import { BRAND, type DocTable, type PlanDocument } from "./document";
import { buildZip, XML_HEADER, xmlEscape } from "./zip";

/**
 * Word document: branded title block, the 21 narrative sections, then
 * the financial tables. Plain WordprocessingML with a small style set;
 * opens in Word, LibreOffice, and Google Docs (upload).
 */
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function run(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): string {
  const props = [opts.bold ? "<w:b/>" : "", opts.color ? `<w:color w:val="${opts.color}"/>` : "", opts.size ? `<w:sz w:val="${opts.size}"/>` : ""].join("");
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`;
}

function para(text: string, style?: string, opts: Parameters<typeof run>[1] = {}): string {
  return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${run(text, opts)}</w:p>`;
}

function fmt(v: string | number, money: boolean): string {
  if (typeof v === "string") return v;
  return money ? usd(v) : String(v);
}

function tableXml(t: DocTable): string {
  const width = 9360;
  const cw = Math.floor(width / t.columns.length);
  const cell = (text: string, header: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/>${header ? `<w:shd w:val="clear" w:color="auto" w:fill="${BRAND.green}"/>` : ""}</w:tcPr><w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>${run(text, header ? { bold: true, color: "FFFFFF", size: 18 } : { size: 18 })}</w:p></w:tc>`;
  const rows = [`<w:tr>${t.columns.map((c) => cell(c, true)).join("")}</w:tr>`, ...t.rows.map((r) => `<w:tr>${r.map((v, i) => cell(fmt(v, t.money_columns.includes(i)), false)).join("")}</w:tr>`)];
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="D1D5DB"/>`).join("");
  return `${para(t.title, "Heading2")}<w:tbl><w:tblPr><w:tblW w:w="${width}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders></w:tblPr><w:tblGrid>${t.columns.map(() => `<w:gridCol w:w="${cw}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>${t.note ? para(t.note, "Note") : ""}<w:p/>`;
}

export function buildDocxDocumentXml(d: PlanDocument): string {
  const body: string[] = [
    para(BRAND.name.toUpperCase(), "Brand", { bold: true, color: BRAND.green }),
    para(d.title, "Title"),
    para(d.subtitle, "Subtitle"),
    para(`Prepared for ${d.business_name} · generated ${d.generated_at.slice(0, 10)} · calculation engine ${d.engine_version}`, "Note"),
    ...d.disclaimers.map((t) => para(t, "Note")),
    para("Summary of key figures", "Heading1"),
    para(`${d.package_name}: ${d.view.machines} machine(s). Total uses of funds ${usd(d.view.sources_and_uses.total_uses)}; financing request ${usd(d.view.sources_and_uses.financing_request)}; working-capital allowance ${usd(d.view.sources_and_uses.working_capital_allowance)} (never an invoice line). Base scenario stabilized annual sales ${usd(d.view.scenarios[1].stabilized_year.sales)}, machine contribution ${usd(d.view.scenarios[1].stabilized_year.contribution)}. Selected financing case payment ${usd(d.view.financing.monthly_debt_service)} per month; variable contribution ${pct(d.view.scenarios[1].break_even.variable_contribution_rate)} of sales.`),
  ];
  for (const s of d.sections) {
    body.push(para(`${s.number}. ${s.title}`, "Heading1"));
    for (const p of s.paragraphs) body.push(para(p));
  }
  body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`, para("Financial tables", "Heading1"));
  for (const t of d.tables) body.push(tableXml(t));
  body.push(para(`${BRAND.name} · ${BRAND.site} · Illustrative projections, not guaranteed income. Financing decisions belong to the lender.`, "Note"));
  return `${XML_HEADER}<w:document ${W}><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1200" w:right="1440" w:bottom="1200" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const STYLES = `${XML_HEADER}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:color w:val="${BRAND.black}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Brand"><w:name w:val="Brand"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${BRAND.green}"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="${BRAND.gray}"/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="${BRAND.green}"/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="${BRAND.gray}"/><w:sz w:val="18"/></w:rPr></w:style>
</w:styles>`;

export function buildDocx(d: PlanDocument): Buffer {
  const types = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const rootRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const docRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return buildZip([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "word/document.xml", data: buildDocxDocumentXml(d) },
    { name: "word/_rels/document.xml.rels", data: docRels },
    { name: "word/styles.xml", data: STYLES },
  ]);
}

export const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
