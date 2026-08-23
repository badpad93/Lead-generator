import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import {
  AGREEMENT_SECTIONS,
  AGREEMENT_VERSION,
  EXHIBIT_A_INTRO,
  EXHIBIT_A_TITLE,
  EXHIBIT_B_STANDING_TERMS,
  EXHIBIT_B_TITLE,
  GOVERNING_LAW,
  PREAMBLE,
  getVcParties,
  type AgreementSigningInput,
} from "@/lib/manufacturerOnboarding/legal";

/**
 * Generate the executed Manufacturer Marketplace Partner Agreement PDF.
 *
 * pdf-lib multi-page. Follows the same pattern as
 * contractorOnboardingPdf.ts: WinAnsi-only via safeText(), auto-
 * pagination, section headings underlined in green, exhibits after
 * the numbered sections, signature block at the end.
 */

export interface ManufacturerAgreementPdfInput {
  agreementVersion: string;
  effectiveDate: string;              // ISO date the manufacturer signed
  manufacturerLegalName: string;
  manufacturerAddress: string;
  signing: AgreementSigningInput;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: string;                   // ISO timestamp
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 54;
const RIGHT = PAGE_WIDTH - 54;
const TOP = PAGE_HEIGHT - 54;
const BOTTOM = 54;
const LINE_H = 13;

const DARK = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.4, 0.4, 0.42);
const GREEN = rgb(0.086, 0.639, 0.29);

export async function generateManufacturerAgreementPdf(
  input: ManufacturerAgreementPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ctx: RenderCtx = { pdf, helv, helvBold, page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: TOP };

  const vc = getVcParties();

  drawCover(ctx, input, vc);

  newPage(ctx);
  drawHeading(ctx, "MARKETPLACE PARTNER AGREEMENT", { size: 18, center: true });
  drawWrappedText(ctx, PREAMBLE);
  ctx.y -= LINE_H / 2;

  // Parties table — mirrors the "Effective Date / VC Operating Entity / …"
  // block on Page 1 of the source PDF.
  drawKeyValueTable(ctx, [
    ["Effective Date", formatDate(input.effectiveDate)],
    ["VC Operating Entity", vc.operatingEntity],
    ["VC Address", vc.address],
    ["Manufacturer / Wholesaler Legal Name", input.manufacturerLegalName],
    ["Manufacturer Address", input.manufacturerAddress],
  ]);

  for (const section of AGREEMENT_SECTIONS) {
    drawSectionHeading(ctx, `${section.number}. ${section.title}`);
    for (const clause of section.clauses) {
      drawWrappedText(ctx, clause);
      ctx.y -= LINE_H / 3;
    }
  }

  // Exhibit A
  drawSectionHeading(ctx, EXHIBIT_A_TITLE, { newPage: true });
  drawKeyValueTable(ctx, [
    ["Shipping Charges / Method", input.signing.shipping_charges_method || "—"],
    ["Returns / Cancellation Terms", input.signing.returns_cancellation_terms || "—"],
    ["Liability Cap Modification", input.signing.liability_cap_modification || "None"],
    ["Exclusivity", input.signing.exclusivity_terms || "None"],
  ]);
  ctx.y -= LINE_H / 2;
  drawSubsection(ctx, "Equipment Pricing Schedule");
  drawWrappedText(ctx, EXHIBIT_A_INTRO);
  drawWrappedText(
    ctx,
    "Approved equipment is maintained electronically on the Vending Connector marketplace catalog. Additions and pricing changes are reflected there per Sections 3.1 and 3.4.",
  );

  // Exhibit B
  drawSectionHeading(ctx, EXHIBIT_B_TITLE, { newPage: true });
  for (const line of EXHIBIT_B_STANDING_TERMS) {
    drawWrappedText(ctx, line);
  }
  ctx.y -= LINE_H / 2;
  drawKeyValueTable(ctx, [
    ["Integration Method / Notes", input.signing.integration_notes || "—"],
    ["Order Acknowledgment Target", input.signing.order_acknowledgment_target || "—"],
    ["Shipment Target", input.signing.shipment_target || "—"],
    ["VC Escalation Contact", vc.escalationContact],
    ["Manufacturer Escalation Contact", input.signing.manufacturer_escalation_contact || "—"],
    ["VC Technical Contact", vc.technicalContact],
    ["Manufacturer Technical Contact", input.signing.manufacturer_technical_contact || "—"],
  ]);

  // Signature block
  drawSectionHeading(ctx, "SIGNATURES", { newPage: true });
  drawWrappedText(
    ctx,
    "By signing below the Manufacturer authorized representative agrees to the Marketplace Partner Agreement above, its Exhibits, and the associated commercial terms. Electronic signatures are permitted per Section 18.",
  );
  ctx.y -= LINE_H;

  drawSignatureBlock(ctx, "Manufacturer / Wholesaler", {
    signerName: input.signing.signer_printed_name,
    signerTitle: input.signing.signer_title,
    signatureType: input.signing.signature_type,
    signedAt: input.signedAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  // VC counter-signature block — left blank at execution time; a
  // Vending Connector authorized representative countersigns later
  // through the admin approval flow.
  ctx.y -= LINE_H;
  drawSignatureBlock(ctx, "Vending Connector / Operating Entity", {
    signerName: "",
    signerTitle: "",
    signatureType: "typed",
    signedAt: "",
    ipAddress: null,
    userAgent: null,
    placeholderOnly: true,
  });

  // Footer / governing law reminder
  ctx.y -= LINE_H * 2;
  ensureRoom(ctx, LINE_H * 3);
  drawWrappedText(
    ctx,
    `Governing law: ${GOVERNING_LAW}. Agreement version: ${input.agreementVersion || AGREEMENT_VERSION}.`,
    { color: MUTED, size: 9 },
  );

  return await pdf.save();
}

// ─────────────────────────────────────────────────────────────
// Render helpers
// ─────────────────────────────────────────────────────────────

interface RenderCtx {
  pdf: PDFDocument;
  helv: PDFFont;
  helvBold: PDFFont;
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

function drawCover(
  ctx: RenderCtx,
  input: ManufacturerAgreementPdfInput,
  vc: ReturnType<typeof getVcParties>,
) {
  ctx.page.drawText("VENDING CONNECTOR", { x: LEFT, y: TOP, size: 11, font: ctx.helvBold, color: GREEN });
  ctx.page.drawText(safeText(vc.operatingEntity), {
    x: LEFT, y: TOP - 14, size: 11, font: ctx.helvBold, color: GREEN,
  });
  ctx.page.drawText("Manufacturer Marketplace Partner Agreement — Executed Copy", {
    x: LEFT, y: TOP - 90, size: 20, font: ctx.helvBold, color: DARK,
  });
  ctx.page.drawText(safeText(input.manufacturerLegalName), {
    x: LEFT, y: TOP - 120, size: 15, font: ctx.helv, color: DARK,
  });
  ctx.page.drawText(`Effective: ${formatDate(input.effectiveDate)}`, {
    x: LEFT, y: TOP - 140, size: 10, font: ctx.helv, color: MUTED,
  });
  ctx.page.drawText(`Signed: ${formatDateTime(input.signedAt)}`, {
    x: LEFT, y: TOP - 154, size: 10, font: ctx.helv, color: MUTED,
  });
  ctx.page.drawText(`Version: ${input.agreementVersion}`, {
    x: LEFT, y: TOP - 168, size: 10, font: ctx.helv, color: MUTED,
  });
  ctx.page.drawText(`Governing law: ${GOVERNING_LAW}`, {
    x: LEFT, y: TOP - 182, size: 10, font: ctx.helv, color: MUTED,
  });

  const toc = [
    "1.  Relationship and Scope",
    "2.  Products and Marketplace Integration",
    "3.  Pricing; Marketplace Economics",
    "4.  Checkout; Payment; Taxes",
    "5.  Orders, Shipping and Fulfillment",
    "6.  Warranty; Product Support",
    "7.  VC-Originated Customers; Non-Circumvention",
    "8.  Financing and Ancillary Services",
    "9.  Customer Data; Confidentiality",
    "10. Intellectual Property and Branding",
    "11. Compliance; Representations",
    "12. Indemnification",
    "13. Limitation of Liability",
    "14. Term; Termination",
    "15. Records; Reporting; Audit",
    "16. Publicity",
    "17. Dispute Resolution; Governing Law",
    "18. Miscellaneous",
    "     Exhibit A — Commercial Terms and Equipment Pricing Schedule",
    "     Exhibit B — Integration and Service Levels",
    "     Signatures",
  ];
  ctx.page.drawText("Contents", { x: LEFT, y: TOP - 220, size: 12, font: ctx.helvBold, color: DARK });
  toc.forEach((line, i) => {
    ctx.page.drawText(safeText(line), {
      x: LEFT, y: TOP - 238 - i * LINE_H, size: 10, font: ctx.helv, color: DARK,
    });
  });
}

function drawHeading(
  ctx: RenderCtx,
  text: string,
  opts?: { size?: number; center?: boolean },
) {
  const size = opts?.size ?? 16;
  ensureRoom(ctx, LINE_H * 3);
  const safe = safeText(text);
  if (opts?.center) {
    const w = ctx.helvBold.widthOfTextAtSize(safe, size);
    const x = (PAGE_WIDTH - w) / 2;
    ctx.page.drawText(safe, { x, y: ctx.y, size, font: ctx.helvBold, color: DARK });
  } else {
    ctx.page.drawText(safe, { x: LEFT, y: ctx.y, size, font: ctx.helvBold, color: DARK });
  }
  ctx.y -= size + 8;
}

function drawSectionHeading(ctx: RenderCtx, title: string, opts?: { newPage?: boolean }) {
  if (opts?.newPage) newPage(ctx);
  ensureRoom(ctx, LINE_H * 3);
  ctx.y -= 6;
  ctx.page.drawText(safeText(title), { x: LEFT, y: ctx.y, size: 13, font: ctx.helvBold, color: DARK });
  ctx.y -= 6;
  ctx.page.drawLine({
    start: { x: LEFT, y: ctx.y },
    end: { x: RIGHT, y: ctx.y },
    thickness: 0.5,
    color: GREEN,
  });
  ctx.y -= 12;
}

function drawSubsection(ctx: RenderCtx, title: string) {
  ensureRoom(ctx, LINE_H * 2);
  ctx.y -= 4;
  ctx.page.drawText(safeText(title), { x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK });
  ctx.y -= LINE_H;
}

function drawKeyValueTable(
  ctx: RenderCtx,
  rows: Array<[string, string]>,
  opts?: { keyWidth?: number },
) {
  const keyWidth = opts?.keyWidth ?? 170;
  for (const [k, v] of rows) {
    ensureRoom(ctx, LINE_H);
    ctx.page.drawText(safeText(k), {
      x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: DARK,
    });
    drawWrappedText(ctx, v, { indent: keyWidth, alreadyAllocatedFirstLine: true });
  }
  ctx.y -= LINE_H / 2;
}

function drawSignatureBlock(
  ctx: RenderCtx,
  party: string,
  args: {
    signerName: string;
    signerTitle: string;
    signatureType: "typed" | "drawn";
    signedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
    placeholderOnly?: boolean;
  },
) {
  ensureRoom(ctx, LINE_H * 8);
  ctx.page.drawText(safeText(party), {
    x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK,
  });
  ctx.y -= LINE_H + 4;

  // Signature line
  ctx.page.drawLine({
    start: { x: LEFT, y: ctx.y },
    end: { x: LEFT + 280, y: ctx.y },
    thickness: 0.75,
    color: DARK,
  });
  if (!args.placeholderOnly && args.signerName) {
    ctx.page.drawText(safeText(args.signerName), {
      x: LEFT, y: ctx.y + 4, size: 14, font: ctx.helvBold, color: DARK,
    });
  }
  ctx.y -= LINE_H;
  ctx.page.drawText("Authorized Signature", { x: LEFT, y: ctx.y, size: 8, font: ctx.helv, color: MUTED });

  ctx.y -= LINE_H * 1.5;
  const rows: Array<[string, string]> = [
    ["Printed Name", args.signerName || "—"],
    ["Title", args.signerTitle || "—"],
    ["Date", args.signedAt ? formatDateTime(args.signedAt) : "—"],
  ];
  if (!args.placeholderOnly) {
    rows.push(["Signature Type", args.signatureType]);
    if (args.ipAddress) rows.push(["IP Address", args.ipAddress]);
    if (args.userAgent) rows.push(["User Agent", truncate(args.userAgent, 78)]);
  }
  drawKeyValueTable(ctx, rows, { keyWidth: 100 });
}

function drawWrappedText(
  ctx: RenderCtx,
  text: string,
  opts?: {
    indent?: number;
    size?: number;
    color?: ReturnType<typeof rgb>;
    alreadyAllocatedFirstLine?: boolean;
  },
) {
  const indent = opts?.indent ?? 0;
  const size = opts?.size ?? 10;
  const color = opts?.color ?? DARK;
  const maxWidth = RIGHT - LEFT - indent;
  const lines = wrap(safeText(text), maxWidth, ctx.helv, size);
  for (let i = 0; i < lines.length; i++) {
    if (!(i === 0 && opts?.alreadyAllocatedFirstLine)) ensureRoom(ctx, LINE_H);
    ctx.page.drawText(lines[i], { x: LEFT + indent, y: ctx.y, size, font: ctx.helv, color });
    ctx.y -= LINE_H;
  }
}

function wrap(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

// Same reasoning as contractorOnboardingPdf.ts: WinAnsi has hard
// limits, and anything outside Latin-1 crashes render — which then
// becomes an HTML 500 page and Safari's "the string did not match
// the expected pattern".
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

function formatDate(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }) + " ET";
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
