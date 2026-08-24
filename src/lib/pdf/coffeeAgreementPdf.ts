import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Coffee-agreement PDF generator.
 *
 * One module powers three things:
 *   1. The customer-facing REFERENCE PDF (unsigned) that admins can
 *      review or link on a coffee marketing page.
 *   2. The AUTO-ATTACHED executed PDF written to the user-agreements
 *      bucket at coffee-supply/{user_id}/{version}/{id}.pdf when
 *      the admin countersigns.
 *   3. Any preview a future admin surface needs.
 *
 * Reads template.content_html at render time so the PDF stays in
 * sync with whatever version of the Equipment Loan & Beverage
 * Supply Agreement is active — no legal text is duplicated in this
 * file. The HTML shape stripped here matches the seed migration
 * (h1/h2/p/ul/li); if a new template introduces different tags,
 * htmlToBlocks() below is the place to extend the parser.
 *
 * Uses pdf-lib with StandardFonts.Helvetica (WinAnsi encoding) and
 * safeText() to normalize curly quotes/dashes/bullets — same pattern
 * as contractorOnboardingPdf.ts. Never throws on Unicode input.
 */

export interface CoffeePdfSignature {
  provider_typed_name: string;
  provider_email: string | null;
  provider_signed_at_iso: string;      // ISO
  provider_ip: string | null;
  provider_consent_esign: boolean;
  countersigner_name: string | null;
  countersigner_email: string | null;
  countersigner_at_iso: string | null; // ISO
}

export interface CoffeePdfMetadata {
  customer_name: string | null;
  customer_address: string | null;
  num_machines: number | null;
  authorized_representative_name: string | null;
  authorized_representative_title: string | null;
  ack_exclusive_supply: boolean;
  ack_minimum_purchase: boolean;
  ack_installation_maintenance: boolean;
}

export interface CoffeePdfInput {
  /** Full HTML body from agreement_templates.content_html. */
  template_content_html: string;
  template_title: string;
  template_version: number;
  template_effective_date: string;     // YYYY-MM-DD
  agreement_id?: string;
  metadata?: CoffeePdfMetadata;
  /** Present → executed copy with signature audit. Absent → reference. */
  signature?: CoffeePdfSignature;
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 54;
const RIGHT = PAGE_WIDTH - 54;
const TOP = PAGE_HEIGHT - 54;
const BOTTOM = 54;
const LINE_H = 14;

const DARK  = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.4,  0.4,  0.42);
const GREEN = rgb(0.086, 0.639, 0.29); // #16A34A
const AMBER = rgb(0.92, 0.60, 0.05);

export async function generateCoffeeAgreementPdf(
  input: CoffeePdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helv     = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helvItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const ctx: RenderCtx = {
    pdf,
    helv,
    helvBold,
    helvItalic,
    page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: TOP,
  };

  drawCover(ctx, input);

  // Body — parsed straight from the template HTML.
  const blocks = htmlToBlocks(input.template_content_html);
  newPage(ctx);
  for (const block of blocks) {
    if (block.kind === "h1") drawH1(ctx, block.text);
    else if (block.kind === "h2") drawH2(ctx, block.text);
    else if (block.kind === "p") drawParagraph(ctx, block.text);
    else if (block.kind === "em") drawParagraph(ctx, block.text, { italic: true, color: MUTED });
    else if (block.kind === "li") drawBullet(ctx, block.text);
  }

  // Metadata block — customer / machines / rep — always renders when
  // present so the PDF is a standalone record of what was signed.
  if (input.metadata) drawMetadataBlock(ctx, input.metadata);

  // Signature block or reference watermark.
  if (input.signature) {
    drawSignatureBlock(ctx, input.signature, input);
  } else {
    drawReferenceFooter(ctx);
  }

  drawPageFooters(ctx.pdf, helv, input);
  return await pdf.save();
}

// ─────────────────────────────────────────────────────────────
// Cover
// ─────────────────────────────────────────────────────────────

function drawCover(ctx: RenderCtx, input: CoffeePdfInput) {
  ctx.page.drawText("VENDING CONNECTOR", { x: LEFT, y: TOP,       size: 11, font: ctx.helvBold, color: GREEN });
  ctx.page.drawText("APEX AI VENDING",    { x: LEFT, y: TOP - 14, size: 11, font: ctx.helvBold, color: GREEN });

  ctx.page.drawText("Equipment Loan &", {
    x: LEFT, y: TOP - 100, size: 26, font: ctx.helvBold, color: DARK,
  });
  ctx.page.drawText("Beverage Supply Agreement", {
    x: LEFT, y: TOP - 130, size: 26, font: ctx.helvBold, color: DARK,
  });

  ctx.page.drawText(safeText(input.template_title), {
    x: LEFT, y: TOP - 170, size: 12, font: ctx.helv, color: MUTED,
  });
  ctx.page.drawText(`Version ${input.template_version}  ·  Effective ${input.template_effective_date}`, {
    x: LEFT, y: TOP - 188, size: 10, font: ctx.helv, color: MUTED,
  });

  // Customer summary if present
  const m = input.metadata;
  let y = TOP - 240;
  if (m?.customer_name) {
    ctx.page.drawText("Customer", { x: LEFT, y, size: 11, font: ctx.helvBold, color: DARK });
    y -= 14;
    ctx.page.drawText(safeText(m.customer_name), { x: LEFT, y, size: 12, font: ctx.helv, color: DARK });
    y -= 18;
  }
  if (m?.customer_address) {
    ctx.page.drawText("Address", { x: LEFT, y, size: 11, font: ctx.helvBold, color: DARK });
    y -= 14;
    for (const line of wrap(safeText(m.customer_address), RIGHT - LEFT, ctx.helv, 12)) {
      ctx.page.drawText(line, { x: LEFT, y, size: 12, font: ctx.helv, color: DARK });
      y -= 14;
    }
    y -= 6;
  }
  if (m?.num_machines != null) {
    ctx.page.drawText("Number of Machines", { x: LEFT, y, size: 11, font: ctx.helvBold, color: DARK });
    y -= 14;
    ctx.page.drawText(String(m.num_machines), { x: LEFT, y, size: 12, font: ctx.helv, color: DARK });
    y -= 18;
  }

  if (!input.signature) {
    ctx.page.drawText("REFERENCE COPY — UNSIGNED", {
      x: LEFT, y: BOTTOM + 40, size: 10, font: ctx.helvBold, color: AMBER,
    });
    ctx.page.drawText(
      "This document is the current template of the Equipment Loan & Beverage Supply Agreement. It has not been signed and is not a binding contract.",
      { x: LEFT, y: BOTTOM + 24, size: 9, font: ctx.helv, color: MUTED, maxWidth: RIGHT - LEFT },
    );
  } else if (input.agreement_id) {
    ctx.page.drawText(`Agreement ID: ${input.agreement_id}`, {
      x: LEFT, y: BOTTOM + 24, size: 9, font: ctx.helv, color: MUTED,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Body helpers
// ─────────────────────────────────────────────────────────────

function drawH1(ctx: RenderCtx, text: string) {
  ensureRoom(ctx, LINE_H * 3);
  ctx.page.drawText(safeText(text), { x: LEFT, y: ctx.y, size: 16, font: ctx.helvBold, color: DARK });
  ctx.y -= 6;
  ctx.page.drawLine({ start: { x: LEFT, y: ctx.y }, end: { x: RIGHT, y: ctx.y }, thickness: 0.6, color: GREEN });
  ctx.y -= 14;
}

function drawH2(ctx: RenderCtx, text: string) {
  ensureRoom(ctx, LINE_H * 2);
  ctx.y -= 4;
  ctx.page.drawText(safeText(text), { x: LEFT, y: ctx.y, size: 12, font: ctx.helvBold, color: DARK });
  ctx.y -= LINE_H;
}

function drawParagraph(
  ctx: RenderCtx,
  text: string,
  opts?: { italic?: boolean; color?: ReturnType<typeof rgb> },
) {
  const font = opts?.italic ? ctx.helvItalic : ctx.helv;
  const color = opts?.color ?? DARK;
  const clean = safeText(text);
  const lines = wrap(clean, RIGHT - LEFT, font, 10);
  for (const line of lines) {
    ensureRoom(ctx, LINE_H);
    ctx.page.drawText(line, { x: LEFT, y: ctx.y, size: 10, font, color });
    ctx.y -= LINE_H;
  }
  ctx.y -= 4;
}

function drawBullet(ctx: RenderCtx, text: string) {
  const clean = safeText(text);
  const lines = wrap(clean, RIGHT - LEFT - 14, ctx.helv, 10);
  for (let i = 0; i < lines.length; i++) {
    ensureRoom(ctx, LINE_H);
    if (i === 0) ctx.page.drawText("*", { x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: GREEN });
    ctx.page.drawText(lines[i], { x: LEFT + 14, y: ctx.y, size: 10, font: ctx.helv, color: DARK });
    ctx.y -= LINE_H;
  }
}

// ─────────────────────────────────────────────────────────────
// Signature + metadata blocks
// ─────────────────────────────────────────────────────────────

function drawMetadataBlock(ctx: RenderCtx, m: CoffeePdfMetadata) {
  ensureRoom(ctx, LINE_H * 8);
  ctx.y -= 6;
  drawH2(ctx, "Signature Page — Customer Details");
  const rows: Array<[string, string]> = [];
  if (m.customer_name)                       rows.push(["Customer Name",              m.customer_name]);
  if (m.customer_address)                    rows.push(["Customer Address",           m.customer_address]);
  if (m.num_machines != null)                rows.push(["Number of Machines",         String(m.num_machines)]);
  if (m.authorized_representative_name)      rows.push(["Authorized Representative",  m.authorized_representative_name]);
  if (m.authorized_representative_title)     rows.push(["Representative Title",       m.authorized_representative_title]);

  const keyWidth = 190;
  for (const [k, v] of rows) {
    ensureRoom(ctx, LINE_H);
    ctx.page.drawText(safeText(k), { x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: DARK });
    const wrapped = wrap(safeText(v), RIGHT - LEFT - keyWidth, ctx.helv, 10);
    for (let i = 0; i < wrapped.length; i++) {
      if (i > 0) { ctx.y -= LINE_H; ensureRoom(ctx, LINE_H); }
      ctx.page.drawText(wrapped[i], { x: LEFT + keyWidth, y: ctx.y, size: 10, font: ctx.helv, color: DARK });
    }
    ctx.y -= LINE_H;
  }

  ctx.y -= 6;
  drawH2(ctx, "Acknowledgments");
  drawCheck(ctx, m.ack_exclusive_supply,          "Customer agrees to the exclusive supply requirement.");
  drawCheck(ctx, m.ack_minimum_purchase,          "Customer acknowledges the minimum purchase requirement.");
  drawCheck(ctx, m.ack_installation_maintenance,  "Customer acknowledges responsibility for installation and maintenance obligations.");
}

function drawCheck(ctx: RenderCtx, checked: boolean, label: string) {
  ensureRoom(ctx, LINE_H);
  ctx.page.drawText(checked ? "[X]" : "[ ]", { x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: checked ? GREEN : MUTED });
  const wrapped = wrap(safeText(label), RIGHT - LEFT - 26, ctx.helv, 10);
  for (let i = 0; i < wrapped.length; i++) {
    if (i > 0) { ctx.y -= LINE_H; ensureRoom(ctx, LINE_H); }
    ctx.page.drawText(wrapped[i], { x: LEFT + 26, y: ctx.y, size: 10, font: ctx.helv, color: DARK });
  }
  ctx.y -= LINE_H;
}

function drawSignatureBlock(ctx: RenderCtx, s: CoffeePdfSignature, input: CoffeePdfInput) {
  ctx.y -= 10;
  ensureRoom(ctx, LINE_H * 10);
  drawH2(ctx, "Signatures");

  ctx.page.drawText("Customer", { x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK });
  ctx.y -= LINE_H;
  drawKv(ctx, "Typed name",                s.provider_typed_name);
  drawKv(ctx, "Email",                     s.provider_email ?? "-");
  drawKv(ctx, "Signed at (UTC)",           formatDateTime(s.provider_signed_at_iso));
  drawKv(ctx, "IP address",                s.provider_ip ?? "-");
  drawKv(ctx, "E-records consent",         s.provider_consent_esign ? "Yes" : "No");

  ctx.y -= 8;
  ctx.page.drawText("Vending Connector / Apex AI Vending", { x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK });
  ctx.y -= LINE_H;
  drawKv(ctx, "Countersigner",             s.countersigner_name ?? "-");
  drawKv(ctx, "Email",                     s.countersigner_email ?? "-");
  drawKv(ctx, "Countersigned at (UTC)",    s.countersigner_at_iso ? formatDateTime(s.countersigner_at_iso) : "-");

  ctx.y -= 8;
  ctx.page.drawText(
    `Template: ${input.template_title} v${input.template_version} · Effective ${input.template_effective_date}${input.agreement_id ? ` · Agreement ID ${input.agreement_id}` : ""}`,
    { x: LEFT, y: ctx.y, size: 8, font: ctx.helv, color: MUTED, maxWidth: RIGHT - LEFT },
  );
  ctx.y -= LINE_H;
}

function drawReferenceFooter(ctx: RenderCtx) {
  ctx.y -= 20;
  ensureRoom(ctx, LINE_H * 3);
  ctx.page.drawText("REFERENCE COPY — UNSIGNED", { x: LEFT, y: ctx.y, size: 12, font: ctx.helvBold, color: AMBER });
  ctx.y -= LINE_H;
  ctx.page.drawText(
    "The signature page above is intentionally blank in the reference version. Actual signed copies are generated at countersign and attached to the customer's account.",
    { x: LEFT, y: ctx.y, size: 9, font: ctx.helv, color: MUTED, maxWidth: RIGHT - LEFT },
  );
  ctx.y -= LINE_H;
}

function drawKv(ctx: RenderCtx, k: string, v: string) {
  ensureRoom(ctx, LINE_H);
  ctx.page.drawText(safeText(k), { x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: DARK });
  ctx.page.drawText(safeText(v), { x: LEFT + 180, y: ctx.y, size: 10, font: ctx.helv, color: DARK });
  ctx.y -= LINE_H;
}

// ─────────────────────────────────────────────────────────────
// Page footers (page N of M)
// ─────────────────────────────────────────────────────────────

function drawPageFooters(pdf: PDFDocument, helv: PDFFont, input: CoffeePdfInput) {
  const pages = pdf.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const p = pages[i];
    p.drawText(
      `${input.template_title} · v${input.template_version} · Page ${i + 1} of ${total}`,
      { x: LEFT, y: 24, size: 8, font: helv, color: MUTED },
    );
    if (!input.signature) {
      p.drawText("REFERENCE COPY", { x: RIGHT - 90, y: 24, size: 8, font: helv, color: AMBER });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// HTML → structured blocks
// ─────────────────────────────────────────────────────────────

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "em"; text: string }
  | { kind: "li"; text: string };

/**
 * Minimal HTML parser matched to the coffee template shape from
 * migration 117: h1, h2, p, p>em, ul>li. Anything else is coerced
 * to a plain paragraph. Order is preserved.
 */
export function htmlToBlocks(html: string): Block[] {
  const clean = html.replace(/\r?\n/g, "").replace(/\s+/g, " ");
  const blocks: Block[] = [];
  const re = /<(h1|h2|p|ul)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) != null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    if (tag === "h1") blocks.push({ kind: "h1", text: stripTags(inner) });
    else if (tag === "h2") blocks.push({ kind: "h2", text: stripTags(inner) });
    else if (tag === "p") {
      const emMatch = /^<em>([\s\S]*)<\/em>$/i.exec(inner.trim());
      if (emMatch) blocks.push({ kind: "em", text: stripTags(emMatch[1]) });
      else blocks.push({ kind: "p", text: stripTags(inner) });
    } else if (tag === "ul") {
      const liRe = /<li(?:\s[^>]*)?>([\s\S]*?)<\/li>/gi;
      let li: RegExpExecArray | null;
      while ((li = liRe.exec(inner)) != null) {
        blocks.push({ kind: "li", text: stripTags(li[1]) });
      }
    }
  }
  return blocks;
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// ─────────────────────────────────────────────────────────────
// pdf-lib scaffolding
// ─────────────────────────────────────────────────────────────

interface RenderCtx {
  pdf: PDFDocument;
  helv: PDFFont;
  helvBold: PDFFont;
  helvItalic: PDFFont;
  page: PDFPage;
  y: number;
}

function newPage(ctx: RenderCtx) {
  ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.y = TOP;
}

function ensureRoom(ctx: RenderCtx, needed: number) {
  if (ctx.y - needed < BOTTOM) newPage(ctx);
}

/**
 * pdf-lib's StandardFonts.Helvetica uses WinAnsi (CP1252). Anything
 * outside that range throws at render time. Same normalizer used
 * by src/lib/pdf/contractorOnboardingPdf.ts — kept independent so
 * either module can evolve without dragging the other along.
 */
function safeText(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/ /g, " ")
    .replace(/‑/g, "-")
    .replace(/[→←↑↓]/g, "->")
    .replace(/[^\x00-\xFF]/g, "?");
}

function wrap(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) > maxWidth) {
      if (line) out.push(line);
      line = w;
    } else {
      line = trial;
    }
  }
  if (line) out.push(line);
  return out;
}

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}
