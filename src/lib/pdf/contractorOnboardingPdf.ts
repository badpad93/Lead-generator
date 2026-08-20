import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import {
  INDEPENDENT_CONTRACTOR_AGREEMENT,
  CONFIDENTIALITY_AGREEMENT,
  SALES_POLICY_ACKNOWLEDGMENTS,
  COMMISSION_SCHEDULE,
} from "@/lib/contractorOnboarding/legal";

/**
 * Generate the signed contractor onboarding packet PDF.
 *
 * Uses pdf-lib (already the codebase standard — see
 * src/lib/pdf/agreementPdf.ts). Multi-page with auto pagination
 * copied from the generateLocationAgreementPdf pattern.
 *
 * Deliberately does NOT include:
 *   - Full bank account number (Dwolla holds it — we only note that
 *     the account was verified via Plaid on <date>).
 *   - W-9 content (that's a separate restricted document at
 *     restrictedW9StoragePath — not embedded).
 *   - Raw TIN / SSN.
 *
 * Includes:
 *   1. Cover page
 *   2. Contractor information summary
 *   3. Independent Contractor Agreement text
 *   4. Confidentiality Agreement text
 *   5. Sales / CRM Policy acknowledgments (with check-marks)
 *   6. Commission Schedule
 *   7. Signature audit trail (per-document typed name, IP, UA, ts)
 */

export interface ContractorPdfSignatureRow {
  document_key: string;
  document_version: string;
  signature_type: "typed" | "drawn";
  typed_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

export interface ContractorPdfInput {
  contractorName: string;
  payeeLegalName: string | null;
  businessName: string | null;
  contractorEmail: string;
  mailingAddress: string | null;
  mailingCity: string | null;
  mailingState: string | null;
  mailingZip: string | null;
  phoneNumber: string | null;
  stateOfResidence: string | null;
  startDate: string;
  completedAt: string;
  agreementVersion: string;
  paymentVerifiedAt: string | null;
  salesPolicyAcks: Record<string, boolean>;
  signatures: ContractorPdfSignatureRow[];
}

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 54;
const RIGHT = PAGE_WIDTH - 54;
const TOP = PAGE_HEIGHT - 54;
const BOTTOM = 54;
const LINE_H = 14;

const DARK = rgb(0.11, 0.11, 0.12);
const MUTED = rgb(0.4, 0.4, 0.42);
const GREEN = rgb(0.086, 0.639, 0.29); // #16A34A

export async function generateContractorPacketPdf(
  input: ContractorPdfInput,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ctx: RenderCtx = { pdf, helv, helvBold, page: pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: TOP };

  drawCover(ctx, input);

  newPage(ctx);
  drawSectionHeading(ctx, "Contractor Information");
  drawKeyValueTable(ctx, [
    ["Legal Name", input.contractorName],
    ["Preferred / Payee Legal Name", input.payeeLegalName || "—"],
    ["Business / LLC", input.businessName || "—"],
    ["Email", input.contractorEmail],
    ["Phone", input.phoneNumber || "—"],
    ["Mailing Address", [input.mailingAddress, input.mailingCity, input.mailingState, input.mailingZip].filter(Boolean).join(", ") || "—"],
    ["State of Residence", input.stateOfResidence || "—"],
    ["Start Date", formatDate(input.startDate)],
    ["Packet Completed", formatDateTime(input.completedAt)],
    ["Agreement Version", input.agreementVersion],
  ]);
  // Note: W-9 + banking details are intentionally NOT part of this
  // packet in the current 2026-01-v1 flow. They are handled outside
  // the digital onboarding surface.

  drawSectionHeading(ctx, "Independent Contractor Agreement", { newPage: true });
  const ica = INDEPENDENT_CONTRACTOR_AGREEMENT;
  drawSubsection(ctx, "Services");
  drawBulletList(ctx, ica.scopeOfServices);
  drawSubsection(ctx, "Authorized Representations — Contractor may communicate:");
  drawBulletList(ctx, ica.authorizedRepresentations.may);
  drawSubsection(ctx, "Contractor may NOT:");
  drawBulletList(ctx, ica.authorizedRepresentations.mayNot);
  drawSubsection(ctx, "Independent Contractor Status");
  drawBulletList(ctx, ica.independentContractorStatus);
  drawSubsection(ctx, "No Non-Compete");
  drawWrappedText(ctx, ica.noNonCompete);
  drawSubsection(ctx, "CRM Requirements");
  drawBulletList(ctx, ica.crmRequirements);

  drawSectionHeading(ctx, "Confidentiality & Customer Data Agreement", { newPage: true });
  const c = CONFIDENTIALITY_AGREEMENT;
  drawSubsection(ctx, "Restrictions");
  drawBulletList(ctx, c.restrictions);
  drawSubsection(ctx, "Prohibited Storage Locations");
  drawBulletList(ctx, c.prohibitedStorageLocations);
  drawSubsection(ctx, "Data Deletion on Termination");
  drawBulletList(ctx, c.dataDeletionOnTermination);
  drawSubsection(ctx, "Acknowledgment");
  drawWrappedText(ctx, c.acknowledgment);

  drawSectionHeading(ctx, "Sales / CRM Policy Acknowledgments", { newPage: true });
  drawWrappedText(ctx, "Each item below was individually acknowledged by the contractor during onboarding.");
  ctx.y -= LINE_H / 2;
  for (const item of SALES_POLICY_ACKNOWLEDGMENTS) {
    ensureRoom(ctx, LINE_H);
    const checked = !!input.salesPolicyAcks[item];
    ctx.page.drawText(checked ? "[x]" : "[ ]", {
      x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: checked ? GREEN : MUTED,
    });
    drawWrappedText(ctx, item, { indent: 24 });
  }

  drawSectionHeading(ctx, "Commission Schedule", { newPage: true });
  for (const item of COMMISSION_SCHEDULE.items) {
    ensureRoom(ctx, LINE_H * 3);
    ctx.page.drawText(item.label, { x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK });
    ctx.y -= LINE_H;
    drawWrappedText(ctx, item.amount, { color: GREEN });
    drawWrappedText(ctx, item.description);
    ctx.y -= LINE_H / 2;
  }
  drawSubsection(ctx, "When Commissions Are Earned");
  drawBulletList(ctx, COMMISSION_SCHEDULE.earnedRule);
  drawSubsection(ctx, "Payment Schedule");
  drawBulletList(ctx, COMMISSION_SCHEDULE.paymentSchedule);
  drawSubsection(ctx, "Refunds & Chargebacks");
  drawBulletList(ctx, COMMISSION_SCHEDULE.refundsAndChargebacks);
  drawSubsection(ctx, "Post-Termination Commissions");
  drawBulletList(ctx, COMMISSION_SCHEDULE.postTerminationCommissions);

  drawSectionHeading(ctx, "Electronic Signature Audit Trail", { newPage: true });
  drawWrappedText(
    ctx,
    "The contractor electronically signed each of the following documents. Each row records the signer, the exact document version signed, the signature capture method, timestamp, and originating request context.",
  );
  ctx.y -= LINE_H / 2;
  for (const sig of input.signatures) {
    ensureRoom(ctx, LINE_H * 6);
    ctx.page.drawText(labelForDocumentKey(sig.document_key), {
      x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK,
    });
    ctx.y -= LINE_H;
    const rows: Array<[string, string]> = [
      ["Signed by", sig.typed_name || "—"],
      ["Signature type", sig.signature_type],
      ["Version", sig.document_version],
      ["Signed at", formatDateTime(sig.signed_at)],
    ];
    if (sig.ip_address) rows.push(["IP address", sig.ip_address]);
    if (sig.user_agent) rows.push(["User agent", truncate(sig.user_agent, 78)]);
    drawKeyValueTable(ctx, rows, { keyWidth: 90, small: true });
    ctx.y -= LINE_H / 2;
  }

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

function drawCover(ctx: RenderCtx, input: ContractorPdfInput) {
  ctx.page.drawText("VENDING CONNECTOR", { x: LEFT, y: TOP, size: 11, font: ctx.helvBold, color: GREEN });
  ctx.page.drawText("APEX AI VENDING LLP", { x: LEFT, y: TOP - 14, size: 11, font: ctx.helvBold, color: GREEN });

  ctx.page.drawText("Contractor Onboarding Packet", {
    x: LEFT, y: TOP - 80, size: 22, font: ctx.helvBold, color: DARK,
  });
  ctx.page.drawText(input.contractorName, {
    x: LEFT, y: TOP - 110, size: 16, font: ctx.helv, color: DARK,
  });
  ctx.page.drawText(`Start Date: ${formatDate(input.startDate)}`, {
    x: LEFT, y: TOP - 132, size: 11, font: ctx.helv, color: MUTED,
  });
  ctx.page.drawText(`Signed and submitted: ${formatDateTime(input.completedAt)}`, {
    x: LEFT, y: TOP - 148, size: 11, font: ctx.helv, color: MUTED,
  });
  ctx.page.drawText(`Agreement version: ${input.agreementVersion}`, {
    x: LEFT, y: TOP - 164, size: 10, font: ctx.helv, color: MUTED,
  });

  ctx.page.drawText("Contents", { x: LEFT, y: TOP - 210, size: 12, font: ctx.helvBold, color: DARK });
  const toc = [
    "1. Contractor Information",
    "2. Independent Contractor Agreement",
    "3. Confidentiality & Customer Data Agreement",
    "4. Sales / CRM Policy Acknowledgments",
    "5. Commission Schedule",
    "6. Electronic Signature Audit Trail",
  ];
  toc.forEach((line, i) => {
    ctx.page.drawText(line, {
      x: LEFT, y: TOP - 230 - i * LINE_H, size: 11, font: ctx.helv, color: DARK,
    });
  });

  ctx.page.drawText(
    "This document is the contractor-facing packet. Restricted tax and banking records are stored separately and available only to authorized finance staff.",
    { x: LEFT, y: BOTTOM + 40, size: 9, font: ctx.helv, color: MUTED, maxWidth: RIGHT - LEFT },
  );
}

function drawSectionHeading(ctx: RenderCtx, title: string, opts?: { newPage?: boolean }) {
  if (opts?.newPage) newPage(ctx);
  ensureRoom(ctx, LINE_H * 3);
  ctx.page.drawText(title, { x: LEFT, y: ctx.y, size: 16, font: ctx.helvBold, color: DARK });
  ctx.y -= 8;
  ctx.page.drawLine({
    start: { x: LEFT, y: ctx.y },
    end: { x: RIGHT, y: ctx.y },
    thickness: 0.5,
    color: GREEN,
  });
  ctx.y -= 16;
}

function drawSubsection(ctx: RenderCtx, title: string) {
  ensureRoom(ctx, LINE_H * 2);
  ctx.y -= 4;
  ctx.page.drawText(title, { x: LEFT, y: ctx.y, size: 11, font: ctx.helvBold, color: DARK });
  ctx.y -= LINE_H;
}

function drawKeyValueTable(
  ctx: RenderCtx,
  rows: Array<[string, string]>,
  opts?: { keyWidth?: number; small?: boolean },
) {
  const keyWidth = opts?.keyWidth ?? 160;
  const size = opts?.small ? 9 : 10;
  for (const [k, v] of rows) {
    ensureRoom(ctx, LINE_H);
    ctx.page.drawText(k, { x: LEFT, y: ctx.y, size, font: ctx.helvBold, color: DARK });
    drawWrappedText(ctx, v, { indent: keyWidth, size, alreadyAllocatedFirstLine: true });
  }
}

function drawBulletList(ctx: RenderCtx, items: readonly string[]) {
  for (const item of items) {
    ensureRoom(ctx, LINE_H);
    ctx.page.drawText("•", { x: LEFT, y: ctx.y, size: 10, font: ctx.helvBold, color: GREEN });
    drawWrappedText(ctx, item, { indent: 14 });
  }
}

function drawWrappedText(
  ctx: RenderCtx,
  text: string,
  opts?: { indent?: number; size?: number; color?: ReturnType<typeof rgb>; alreadyAllocatedFirstLine?: boolean },
) {
  const indent = opts?.indent ?? 0;
  const size = opts?.size ?? 10;
  const color = opts?.color ?? DARK;
  const maxWidth = RIGHT - LEFT - indent;
  const lines = wrap(text, maxWidth, ctx.helv, size);
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

function labelForDocumentKey(key: string): string {
  return (
    {
      independent_contractor_agreement: "Independent Contractor Agreement",
      commission_agreement: "Commission Agreement",
      confidentiality_agreement: "Confidentiality Agreement",
      sales_policy: "Sales / CRM Policy",
      payment_authorization: "Payment Authorization",
    } as Record<string, string>
  )[key] ?? key;
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
