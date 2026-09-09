import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertInvoice } from "@/lib/paymentLedger";
import { formatContractDate } from "@/lib/agreements/formatDate";
import { Resend } from "resend";
import { pdfSafeInline, pdfSafeMultiline } from "./pdfSafeText";
import {
  lineTotal,
  sumLines,
  type ItemCategory,
  type LineItemLike,
  type SnapshotLine,
} from "@/lib/pricing/lineItems";
import { buildOrderItemsFromAgreement } from "@/lib/agreements/sync";
import { shouldAutoCreateOrderOnSign } from "@/lib/agreements/autoInvoiceGuard";
import { htmlToBlocks } from "@/lib/pdf/coffeeAgreementPdf";
import { isUsableCoffeeSnapshot, COFFEE_ACK_LABELS } from "@/lib/agreements/coffeeSupplyPackage";
import { initialsKeyFor, type AgreementSectionId } from "@/lib/agreements/sections";
import { wrapText, measureWrappedHeight, ellipsize } from "@/lib/pdf/layout";
import {
  buildAgreement,
  type NumberedClause,
  type ClauseBlock,
  type ClauseTableKey,
} from "@/lib/agreements/clauses";

const CATEGORY_LABEL: Record<ItemCategory, string> = {
  equipment: "Equipment",
  location_services: "Location Services",
  coffee: "Coffee Program",
  freight: "Shipping & Freight",
  financing: "Financing",
  other: "Other",
};

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

/* ================================================================== */
/*  PDF Generation — Purchase Agreement with signatures & initials    */
/* ================================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generatePurchaseAgreementPdf(ag: any, signatures: any[], initials: any[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.086, 0.635, 0.294);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.07, 0.07, 0.07);
  const lightBg = rgb(0.96, 0.96, 0.96);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 50;
  const RIGHT = 562;
  const MAX_W = RIGHT - LEFT;
  const BOTTOM_MARGIN = 80;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = 740;

  /* ---- helpers ---- */
  function newPage() {
    drawText(page, "Apex AI Vending — Purchase Agreement", LEFT, 30, helvetica, 7, gray);
    const pageNum = doc.getPageCount();
    const numStr = `Page ${pageNum}`;
    drawText(page, numStr, RIGHT - helvetica.widthOfTextAtSize(numStr, 7), 30, helvetica, 7, gray);
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = 740;
  }

  function checkPage(needed: number) {
    if (y - needed < BOTTOM_MARGIN) newPage();
  }

  /** Reserve `height` of vertical space above the footer; start a new
   *  page if it won't fit. Semantic alias of checkPage for measured
   *  blocks. */
  function ensureSpace(height: number) {
    if (y - height < BOTTOM_MARGIN) newPage();
  }

  function drawText(
    p: PDFPage,
    text: string,
    x: number,
    yPos: number,
    font: PDFFont,
    size: number,
    color = dark,
  ) {
    p.drawText(pdfSafeInline(text), { x, y: yPos, size, font, color });
  }

  function drawLine(yPos: number) {
    page.drawLine({
      start: { x: LEFT, y: yPos },
      end: { x: RIGHT, y: yPos },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
  }

  /** Draw wrapped text inside a column [x, x+maxWidth], measuring each
   *  line and breaking to a new page before any line would cross the
   *  footer. Every line fits maxWidth (long tokens are hard-broken). */
  function drawWrappedInBox(
    text: string,
    x: number,
    maxWidth: number,
    font: PDFFont,
    size: number,
    color = gray,
  ) {
    const lineHeight = size + 4;
    const lines = wrapText(pdfSafeMultiline(text), font, size, maxWidth);
    for (const line of lines) {
      ensureSpace(lineHeight);
      if (line !== "") drawText(page, line, x, y, font, size, color);
      y -= lineHeight;
    }
  }

  function drawWrapped(
    text: string,
    font: PDFFont,
    size: number,
    color = gray,
    indent = 0,
  ) {
    drawWrappedInBox(text, LEFT + indent, MAX_W - indent, font, size, color);
  }

  // Initials bind to the section's STABLE id (from clauses/sections),
  // never a display number, so the right box stays with the right clause.
  let currentInitialsKey: string | null = null;

  function getInitialsForSection(): string | null {
    if (!currentInitialsKey) return null;
    const found = initials.find(
      (i: { section_key: string; signer_type: string }) =>
        i.section_key === currentInitialsKey && i.signer_type === "operator",
    );
    return found ? found.initials_data : null;
  }

  function initialsPlaceholder() {
    checkPage(20);
    y -= 4;
    const initialsData = getInitialsForSection();
    if (initialsData) {
      drawText(page, `Operator Initials:  ${initialsData}`, RIGHT - 220, y, helveticaBold, 9, green);
    } else {
      drawText(page, "Operator Initials: [______]", RIGHT - 180, y, helvetica, 8, gray);
    }
    y -= 14;
  }

  // A label in the left gutter with its value wrapped in the column to
  // its right, so long values (addresses, company names) never run past
  // the margin. Advances by the taller of the two.
  const VALUE_X = LEFT + 180;
  const VALUE_W = RIGHT - VALUE_X;
  function labelValue(label: string, value: string) {
    const text = value || "—";
    const valueHeight = measureWrappedHeight(text, helveticaBold, 9, VALUE_W, 13);
    ensureSpace(Math.max(16, valueHeight));
    const top = y;
    drawText(page, label, LEFT, top, helvetica, 8, gray);
    const lines = wrapText(text, helveticaBold, 9, VALUE_W);
    let vy = top;
    for (const line of lines) {
      drawText(page, line, VALUE_X, vy, helveticaBold, 9, dark);
      vy -= 13;
    }
    y = Math.min(top - 16, vy) - 3;
  }

  function money(n: unknown): string {
    const num = Number(n) || 0;
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }

  const effectiveDate = formatContractDate(ag.effective_date as string | null | undefined);

  /* ================================================================ */
  /*  PAGE 1 — HEADER                                                 */
  /* ================================================================ */
  drawText(page, "APEX AI VENDING", LEFT, y, helveticaBold, 20, green);
  y -= 16;
  drawText(
    page,
    "Purchase Agreement",
    LEFT,
    y,
    helvetica,
    11,
    gray,
  );
  y -= 12;
  drawText(page, effectiveDate, RIGHT - helvetica.widthOfTextAtSize(effectiveDate, 9), y + 28, helvetica, 9, gray);
  y -= 14;
  drawLine(y);
  y -= 20;

  // Status badge
  const statusLabel = (ag.agreement_status || "draft").toUpperCase();
  page.drawRectangle({
    x: LEFT,
    y: y - 8,
    width: 120,
    height: 22,
    color: rgb(0.95, 0.99, 0.96),
    borderColor: green,
    borderWidth: 1,
  });
  drawText(page, statusLabel, LEFT + 10, y - 2, helveticaBold, 9, green);
  y -= 30;

  /* ================================================================ */
  /*  PARTIES                                                         */
  /* ================================================================ */
  drawText(page, "PARTIES", LEFT, y, helveticaBold, 8, gray);
  y -= 20;

  // Two wrapped columns. Each stacked field wraps within its column so a
  // long company name, legal name or email never overflows the margin or
  // spills into the other column. The row advances by the taller column.
  const COL_L_X = LEFT;
  const COL_R_X = LEFT + 270;
  const COL_L_W = COL_R_X - COL_L_X - 12;
  const COL_R_W = RIGHT - COL_R_X;
  interface PartyField { text: string; font: PDFFont; size: number; color: ReturnType<typeof rgb>; }
  const providerFields: PartyField[] = [
    { text: "SERVICE PROVIDER", font: helveticaBold, size: 8, color: gray },
    { text: ag.apex_company_name || "Apex AI Vending LLC", font: helveticaBold, size: 10, color: dark },
    { text: ag.apex_representative_name || "—", font: helvetica, size: 9, color: gray },
    { text: ag.apex_representative_email || "", font: helvetica, size: 8, color: gray },
  ].filter((f) => f.text !== "");
  const operatorFields: PartyField[] = [
    { text: "OPERATOR", font: helveticaBold, size: 8, color: gray },
    { text: ag.operator_company_name || "—", font: helveticaBold, size: 10, color: dark },
    { text: ag.operator_legal_name || "—", font: helvetica, size: 9, color: gray },
    { text: ag.operator_email || "", font: helvetica, size: 8, color: gray },
    { text: ag.operator_phone || "", font: helvetica, size: 8, color: gray },
  ].filter((f) => f.text !== "");

  function partyColumnHeight(fields: PartyField[], width: number): number {
    return fields.reduce(
      (h, f) => h + measureWrappedHeight(f.text, f.font, f.size, width, f.size + 4),
      0,
    );
  }
  function drawPartyColumn(fields: PartyField[], x: number, width: number, top: number): number {
    let cy = top;
    for (const f of fields) {
      for (const line of wrapText(f.text, f.font, f.size, width)) {
        drawText(page, line, x, cy, f.font, f.size, f.color);
        cy -= f.size + 4;
      }
    }
    return cy;
  }
  const partiesHeight = Math.max(
    partyColumnHeight(providerFields, COL_L_W),
    partyColumnHeight(operatorFields, COL_R_W),
  );
  ensureSpace(partiesHeight + 8);
  const partiesTop = y;
  drawPartyColumn(providerFields, COL_L_X, COL_L_W, partiesTop);
  drawPartyColumn(operatorFields, COL_R_X, COL_R_W, partiesTop);
  y = partiesTop - partiesHeight - 8;

  /* ================================================================ */
  /*  CANONICAL AGREEMENT CONTENT                                     */
  /*  Rendered from src/lib/agreements/clauses.ts — the single source */
  /*  the customer signing page uses. This PDF is a renderer, not an  */
  /*  author of contract terms.                                       */
  /* ================================================================ */
  const built = buildAgreement(ag);
  const v = built.values;

  const snapshotLines: SnapshotLine[] = Array.isArray(ag.line_items_snapshot)
    ? (ag.line_items_snapshot as SnapshotLine[])
    : [];

  // Headings stay with the start of their body: reserve the heading plus
  // ~2 lines so a heading never sits alone at the foot of a page.
  function sectionHeaderNum(num: number, title: string) {
    ensureSpace(34 + 26);
    y -= 12;
    drawLine(y + 6);
    y -= 6;
    for (const line of wrapText(`Section ${num}: ${title}`, helveticaBold, 9, MAX_W)) {
      drawText(page, line, LEFT, y, helveticaBold, 9, dark);
      y -= 13;
    }
    y -= 3;
  }

  function scheduleHeader(title: string) {
    ensureSpace(40 + 24);
    y -= 10;
    drawLine(y);
    y -= 20;
    for (const line of wrapText(title.toUpperCase(), helveticaBold, 10, MAX_W)) {
      drawText(page, line, LEFT, y, helveticaBold, 10, green);
      y -= 14;
    }
    y -= 6;
  }

  function drawParagraph(block: ClauseBlock) {
    if (block.kind !== "p") return;
    const text = block.label ? `${block.label} ${block.text}` : block.text;
    drawWrapped(text, helvetica, 8.5, block.caps ? dark : gray);
    y -= 2;
  }

  /** Draw text so its RIGHT edge sits at `rightX` (currency columns). */
  function drawRightEdge(text: string, rightX: number, yPos: number, font: PDFFont, size: number, color = dark) {
    drawText(page, text, rightX - font.widthOfTextAtSize(text, size), yPos, font, size, color);
  }

  // Schedule A line-item table geometry. Numeric columns are addressed by
  // their RIGHT edge and right-aligned, so currency values stay separated
  // and never collide with the description column, however large.
  const TBL_ITEM_X = LEFT + 4;
  const TBL_ITEM_W = 176;                 // wraps; never truncated
  const TBL_CAT_X = LEFT + 188;
  const TBL_CAT_W = 74;                    // display tag; may ellipsize
  const TBL_QTY_R = LEFT + 300;
  const TBL_UNIT_R = LEFT + 384;
  const TBL_DISC_R = LEFT + 424;
  const TBL_TOTAL_R = RIGHT - 4;

  function drawLineItemsHeader() {
    page.drawRectangle({ x: LEFT, y: y - 4, width: MAX_W, height: 18, color: lightBg });
    drawText(page, "Item", TBL_ITEM_X, y, helveticaBold, 8, dark);
    drawText(page, "Category", TBL_CAT_X, y, helveticaBold, 8, dark);
    drawRightEdge("Qty", TBL_QTY_R, y, helveticaBold, 8, dark);
    drawRightEdge("Unit Price", TBL_UNIT_R, y, helveticaBold, 8, dark);
    drawRightEdge("Disc", TBL_DISC_R, y, helveticaBold, 8, dark);
    drawRightEdge("Line Total", TBL_TOTAL_R, y, helveticaBold, 8, dark);
    y -= 18;
  }

  // Schedule A: every line on the order, verbatim from the Phase-1
  // snapshot — so coffee, coolers, financing and custom lines all appear
  // in the signed contract, not just equipment. Item names and
  // descriptions WRAP (contract text is never truncated); each row is
  // measured before drawing so it can't cross the footer, and the header
  // repeats after a page break.
  function drawLineItemsTable() {
    if (snapshotLines.length === 0) {
      labelValue("Machine Model", v.model);
      labelValue("Quantity", String(v.qty));
      labelValue("Unit Price", v.unitPrice);
      labelValue("Equipment Subtotal", v.subtotal);
      return;
    }

    ensureSpace(18 + 20);
    drawLineItemsHeader();

    for (const line of snapshotLines) {
      const nameLines = wrapText(line.service_name || "Item", helvetica, 8.5, TBL_ITEM_W);
      const descLines = line.description
        ? wrapText(String(line.description), helvetica, 7.5, TBL_ITEM_W - 6)
        : [];
      const deferredLines = line.deferred
        ? wrapText(
            "Invoiced on fulfillment — not included in the amount due prior to procurement",
            helvetica, 7.5, MAX_W - 12,
          )
        : [];
      const rowHeight = nameLines.length * 11 + descLines.length * 10 + deferredLines.length * 10 + 8;

      // Keep the whole row together; repeat the header if it lands on a
      // fresh page.
      if (y - rowHeight < BOTTOM_MARGIN) {
        newPage();
        ensureSpace(18 + 20);
        drawLineItemsHeader();
      }

      const rowTop = y;
      // Numeric cells on the first line of the row, right-aligned.
      drawRightEdge(String(line.quantity ?? 1), TBL_QTY_R, rowTop, helvetica, 8.5, dark);
      drawRightEdge(money(line.unit_price), TBL_UNIT_R, rowTop, helvetica, 8.5, dark);
      drawRightEdge(
        Number(line.discount_percent) > 0 ? `${Number(line.discount_percent)}%` : "—",
        TBL_DISC_R, rowTop, helvetica, 8.5,
        Number(line.discount_percent) > 0 ? green : gray,
      );
      drawRightEdge(money(line.total_price), TBL_TOTAL_R, rowTop, helveticaBold, 8.5, dark);

      // Item name (wrapped) + category tag beside the first line.
      drawText(page, ellipsize(CATEGORY_LABEL[line.category] ?? "Other", helvetica, 8, TBL_CAT_W), TBL_CAT_X, rowTop, helvetica, 8, gray);
      let ty = rowTop;
      for (const nl of nameLines) {
        drawText(page, nl, TBL_ITEM_X, ty, helvetica, 8.5, dark);
        ty -= 11;
      }
      for (const dl of descLines) {
        drawText(page, dl, TBL_ITEM_X + 6, ty, helvetica, 7.5, gray);
        ty -= 10;
      }
      for (const dl of deferredLines) {
        drawText(page, dl, TBL_ITEM_X + 6, ty, helvetica, 7.5, gray);
        ty -= 10;
      }
      y = rowTop - rowHeight;
      drawLine(y + 4);
    }
  }

  function drawTable(key: ClauseTableKey) {
    switch (key) {
      case "equipment":
        labelValue("Machine Model", v.model);
        labelValue("Quantity", String(v.qty));
        labelValue("Unit Price", v.unitPrice);
        labelValue("Equipment Subtotal", v.subtotal);
        break;
      case "freight":
        labelValue("Freight Rate", `${v.freightPerMachine} / machine`);
        labelValue(`Total Freight (${v.qty} machine${v.qty !== 1 ? "s" : ""})`, v.freightTotal);
        if (v.hasStorageFee) {
          labelValue("Storage Fee", `${v.storageFee} / machine / month`);
          labelValue("Free Storage Period", `${v.freeStorageMonths} month${v.freeStorageMonths !== 1 ? "s" : ""}`);
        }
        break;
      case "location":
        labelValue("Locations Purchased", String(v.locations));
        labelValue("Fee Per Secured Location", v.locationFee);
        labelValue("Maximum Service Value", v.maxLocationValue);
        break;
      case "storage":
        labelValue("Storage Fee", `${v.storageFee} / machine / month`);
        labelValue("Free Storage Period", `${v.freeStorageMonths} month${v.freeStorageMonths !== 1 ? "s" : ""}`);
        break;
      case "payment":
        ensureSpace(24);
        drawText(page, "Total Due Prior to Procurement", LEFT + 4, y, helveticaBold, 10, dark);
        drawRightEdge(v.totalDue, TBL_TOTAL_R, y, helveticaBold, 12, green);
        y -= 18;
        if (v.depositOnly) {
          drawWrapped(`+ ${v.locationBalance} Location Services balance due upon fulfillment of secured locations`, helvetica, 8, gray);
        }
        break;
      case "line_items":
        drawLineItemsTable();
        break;
    }
  }

  function renderClause(c: NumberedClause) {
    if (c.isSchedule) {
      scheduleHeader(c.title);
      currentInitialsKey = c.requiresInitials ? (c.initialsKey ?? null) : null;
    } else {
      sectionHeaderNum(c.displayNumber, c.title);
      currentInitialsKey = c.requiresInitials
        ? (initialsKeyFor(c.sectionId as AgreementSectionId) ?? null)
        : null;
    }
    for (const block of c.blocks) {
      if (block.kind === "p") drawParagraph(block);
      else drawTable(block.table);
    }
    if (c.requiresInitials) initialsPlaceholder();
  }

  for (const clause of built.sections) renderClause(clause);
  for (const schedule of built.schedules) renderClause(schedule);

  // Billing / delivery addresses — an information block, NOT a Schedule,
  // so it never conflicts with the canonical Schedule C (Shipping &
  // Storage). Renders only when an address is present.
  if (ag.operator_billing_address || ag.operator_delivery_address) {
    scheduleHeader("Agreement Information");
    labelValue("Billing Address", ag.operator_billing_address || "—");
    labelValue("Delivery Address", ag.operator_delivery_address || "—");
  }

  /* ================================================================ */
  /*  COFFEE SUPPLY AGREEMENT (Model A — one signature covers both)   */
  /*  The FROZEN captured snapshot, so the executed PDF contains the  */
  /*  exact beverage-supply terms the customer saw and signed — never */
  /*  the latest template. Mirrors the sign page + admin preview.     */
  /* ================================================================ */
  const coffeeSnap = ag.coffee_supply_snapshot;
  if (ag.coffee_supply_required && isUsableCoffeeSnapshot(coffeeSnap)) {
    scheduleHeader(coffeeSnap.title || "Equipment Loan & Beverage Supply Agreement");
    const ctx: string[] = [];
    if (coffeeSnap.version != null) ctx.push(`Version ${coffeeSnap.version}`);
    if (coffeeSnap.effective_date) ctx.push(`effective ${coffeeSnap.effective_date}`);
    if (ctx.length > 0) { drawWrapped(ctx.join("  ·  "), helvetica, 8, gray); y -= 2; }
    drawWrapped(
      "The Operator's signature on this Agreement also covers the Equipment Loan & Beverage Supply Agreement set out below.",
      helvetica,
      8.5,
      dark,
    );
    y -= 4;
    for (const block of htmlToBlocks(String(coffeeSnap.content_html))) {
      if (block.kind === "h1" || block.kind === "h2") {
        y -= 4;
        drawWrapped(block.text, helveticaBold, block.kind === "h1" ? 11 : 9.5, dark);
      } else if (block.kind === "li") {
        drawWrapped(`•  ${block.text}`, helvetica, 8.5, gray, 10);
      } else {
        drawWrapped(block.text, helvetica, 8.5, gray);
      }
      y -= 2;
    }

    // Required acknowledgments. Shown as ACCEPTED ([X], green) only when the
    // corresponding column is persisted true (captured at signing); on an
    // unsigned/preview PDF they render as unchecked requirements ([ ]) — the
    // PDF never claims acceptance that isn't in the database.
    y -= 6;
    const anyAck =
      ag.coffee_ack_exclusive_supply === true ||
      ag.coffee_ack_minimum_purchase === true ||
      ag.coffee_ack_shipping_service_return === true;
    drawWrapped(
      anyAck ? "Customer acknowledgments (accepted):" : "Required customer acknowledgments (to be accepted at signing):",
      helveticaBold,
      9,
      dark,
    );
    for (const { key, label } of COFFEE_ACK_LABELS) {
      const accepted = ag[key] === true;
      drawWrapped(`${accepted ? "[X]" : "[ ]"}  ${label}`, helvetica, 8.5, accepted ? green : gray);
    }
    if (ag.coffee_acknowledged_at) {
      drawWrapped(`Acknowledged ${new Date(ag.coffee_acknowledged_at).toLocaleString()}`, helvetica, 7.5, gray);
    }
  }

  /* ================================================================ */
  /*  SIGNATURE BLOCKS                                                */
  /* ================================================================ */
  const operatorSig = signatures.find((s: { signer_type: string }) => s.signer_type === "operator");
  const apexSig = signatures.find((s: { signer_type: string }) => s.signer_type === "apex");

  interface SigLike {
    signature_data?: string; signer_name?: string; signer_title?: string;
    signer_company?: string; signer_email?: string; ip_address?: string;
  }

  function sigMeta(sig: SigLike | undefined, includeIp: boolean): string[] {
    const m: string[] = [];
    if (sig?.signer_company) m.push(`Company: ${sig.signer_company}`);
    if (sig?.signer_email) m.push(`Email: ${sig.signer_email}`);
    if (includeIp && sig?.ip_address) m.push(`IP: ${sig.ip_address}`);
    return m;
  }
  // Height of a whole signature block, so it can be kept on one page.
  function sigBlockHeight(sig: SigLike | undefined, meta: string[]): number {
    return 20 + (sig ? 22 : 0) + 4 * 28 + (meta.length > 0 ? 2 + meta.length * 15 : 0);
  }
  // Draws heading + four signature fields (Signature / Printed Name /
  // Title / Date) + optional meta. Assumes the caller ensured the block
  // fits, so it never splits across a page or into the footer.
  function drawSignatureBlock(
    heading: string,
    sig: SigLike | undefined,
    signedAt: string | null | undefined,
    meta: string[],
  ) {
    drawText(page, heading, LEFT, y, helveticaBold, 9, gray);
    y -= 20;
    if (sig?.signature_data) { drawText(page, sig.signature_data, LEFT, y, helveticaBold, 14, dark); y -= 22; }
    const signedStr = signedAt ? new Date(signedAt).toLocaleDateString() : "";
    // Signature
    drawLine(y + 2);
    drawText(page, "Signature", LEFT, y - 10, helvetica, 8, gray);
    if (sig) drawText(page, "Electronically signed", LEFT + 120, y - 10, helvetica, 7, green);
    y -= 28;
    // Printed Name
    if (sig?.signer_name) drawText(page, ellipsize(sig.signer_name, helveticaBold, 10, 260), LEFT, y + 6, helveticaBold, 10, dark);
    drawLine(y + 2);
    drawText(page, "Printed Name", LEFT, y - 10, helvetica, 8, gray);
    if (signedStr) drawText(page, `Signed: ${signedStr}`, LEFT + 300, y - 10, helvetica, 8, green);
    y -= 28;
    // Title
    if (sig?.signer_title) drawText(page, ellipsize(sig.signer_title, helvetica, 9, 260), LEFT, y + 6, helvetica, 9, dark);
    drawLine(y + 2);
    drawText(page, "Title", LEFT, y - 10, helvetica, 8, gray);
    y -= 28;
    // Date
    if (signedStr) drawText(page, signedStr, LEFT, y + 6, helvetica, 9, dark);
    drawLine(y + 2);
    drawText(page, "Date", LEFT, y - 10, helvetica, 8, gray);
    // Meta lines
    if (meta.length > 0) {
      y -= 2;
      for (const m of meta) {
        y -= 15;
        drawText(page, ellipsize(m, helvetica, 8, MAX_W), LEFT, y, helvetica, 8, gray);
      }
    }
    y -= 30;
  }

  const opMeta = sigMeta(operatorSig, true);
  const apexMeta = sigMeta(apexSig, false);
  const opHeight = sigBlockHeight(operatorSig, opMeta);
  const apexHeight = sigBlockHeight(apexSig, apexMeta);

  // Keep the SIGNATURES heading + intro with the operator block.
  ensureSpace(16 + 24 + 24 + opHeight);
  y -= 16;
  drawLine(y);
  y -= 24;
  drawText(page, "SIGNATURES", LEFT, y, helveticaBold, 11, dark);
  y -= 8;
  drawWrapped(
    "By signing below, the parties acknowledge that they have read, understood, and agree to be bound by the terms and conditions of this Agreement.",
    helvetica, 8.5, gray,
  );
  y -= 12;

  drawSignatureBlock("OPERATOR", operatorSig, ag.operator_signed_at, opMeta);

  ensureSpace(apexHeight);
  drawSignatureBlock("APEX AI VENDING LLC", apexSig, ag.apex_signed_at, apexMeta);

  // Final footer on last page
  drawText(page, "Apex AI Vending — Purchase Agreement", LEFT, 30, helvetica, 7, gray);
  const finalNum = `Page ${doc.getPageCount()}`;
  drawText(page, finalNum, RIGHT - helvetica.widthOfTextAtSize(finalNum, 7), 30, helvetica, 7, gray);

  return doc.save();
}


/* ================================================================== */
/*  handleFullySignedAgreement                                        */
/*  Called when both parties have signed. Generates the final PDF,     */
/*  uploads to storage, emails to operator + james@, saves to account */
/* ================================================================== */
export async function handleFullySignedAgreement(agreementId: string): Promise<void> {
  // Re-fetch agreement with updated timestamps
  const { data: ag, error: agErr } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", agreementId)
    .single();

  if (agErr || !ag) return;

  // Fetch signatures and initials
  const [{ data: signatures }, { data: initials }] = await Promise.all([
    supabaseAdmin
      .from("agreement_signatures")
      .select("*")
      .eq("agreement_id", agreementId)
      .order("signed_at", { ascending: false }),
    supabaseAdmin
      .from("agreement_initials")
      .select("*")
      .eq("agreement_id", agreementId)
      .order("initialed_at", { ascending: true }),
  ]);

  const isLocationPlacement = ag.agreement_type === "location_placement";

  // Generate the signed PDF. GUARDED: a render failure here must NOT
  // abort the function, because the invoice-firing blocks that make
  // the customer able to pay live BELOW this and the callers swallow
  // any throw silently. A brittle PDF once meant "signed + countersigned
  // but payment never triggered." The money path no longer depends on
  // the document render succeeding.
  let pdfBuffer: Buffer | null = null;
  try {
    let pdfBytes: Uint8Array;
    if (isLocationPlacement) {
      const { generateLocationPlacementPdf } = await import("./generateLocationPlacementPdf");
      // Signed copy goes to operator + james@ + rep — never the location —
      // so include the Apex Billing addendum.
      pdfBytes = await generateLocationPlacementPdf(ag, signatures || [], initials || [], "operator");
    } else {
      pdfBytes = await generatePurchaseAgreementPdf(ag, signatures || [], initials || []);
    }
    pdfBuffer = Buffer.from(pdfBytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("agreement_activity_log").insert({
      agreement_id: agreementId,
      activity_type: "signed_pdf_failed",
      description: `Signed PDF generation failed (invoice/order still processed): ${msg}`,
    });
  }

  const companySlug = isLocationPlacement
    ? (ag.location_business_name || "location").replace(/[^a-zA-Z0-9]/g, "_")
    : (ag.operator_company_name || "operator").replace(/[^a-zA-Z0-9]/g, "_");
  const docKind = isLocationPlacement ? "Location-Placement" : "Agreement";
  const fileName = `Signed-${docKind}-${companySlug}-${agreementId.slice(0, 8)}.pdf`;
  const storagePath = `agreements/${agreementId}/${fileName}`;

  // Upload to Supabase storage (only if the PDF rendered)
  let publicUrl = "";
  try {
    const { error: uploadErr } = pdfBuffer
      ? await supabaseAdmin.storage
          .from("sales-documents")
          .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true })
      : { error: new Error("pdf_unavailable") };

    if (!uploadErr) {
      const { data: urlData } = supabaseAdmin.storage
        .from("sales-documents")
        .getPublicUrl(storagePath);
      publicUrl = urlData?.publicUrl || "";
    }
  } catch {
    // Storage upload is best-effort
  }

  // Update signed_pdf_url on agreement
  if (publicUrl) {
    await supabaseAdmin
      .from("purchase_agreements")
      .update({ signed_pdf_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", agreementId);
  }

  // Save document record to operator's account
  if (ag.account_id) {
    try {
      await supabaseAdmin.from("sales_documents").insert({
        account_id: ag.account_id,
        order_id: ag.order_id || null,
        file_url: publicUrl || null,
        file_name: isLocationPlacement
          ? `Location Placement Agreement — ${ag.location_business_name || "Signed"}`
          : `Purchase Agreement — ${ag.operator_company_name || "Signed"}`,
        type: "contract",
      });
    } catch {
      // Non-critical
    }
  }

  // Email the signed PDF
  // - Purchase agreement: operator + james@
  // - Location placement: operator + james@ + rep (all three get the signed copy)
  if (process.env.RESEND_API_KEY && pdfBuffer) {
    try {
      const recipients: string[] = [];
      if (isLocationPlacement) {
        if (ag.placement_operator_email) recipients.push(ag.placement_operator_email);
        if (!recipients.includes("james@apexaivending.com")) {
          recipients.push("james@apexaivending.com");
        }
        if (ag.rep_email && !recipients.includes(ag.rep_email)) {
          recipients.push(ag.rep_email);
        }
      } else {
        if (ag.operator_email) recipients.push(ag.operator_email);
        if (!recipients.includes("james@apexaivending.com")) {
          recipients.push("james@apexaivending.com");
        }
      }

      const totalDue = Number(ag.total_due_prior_to_procurement || 0);
      const subject = isLocationPlacement
        ? `Fully Executed Location Placement Agreement — ${ag.location_business_name || ""}`
        : `Fully Executed Agreement — ${ag.operator_company_name || "Purchase Agreement"}`;

      const html = isLocationPlacement ? `
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="text-align:center;padding:24px 0;border-bottom:2px solid #16a34a;">
    <span style="font-size:22px;font-weight:700;color:#16a34a;">${ag.placement_operator_company || "Vending Operator"}</span>
  </div>
  <div style="padding:24px 0;">
    <h2 style="color:#111;font-size:18px;margin-bottom:16px;">Location Placement Agreement Fully Executed</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6;">
      The Location Placement Agreement between <strong>${ag.placement_operator_company || "Operator"}</strong> and
      <strong>${ag.location_business_name || "Location"}</strong> has been signed by both parties.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Location</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;font-weight:600;">${ag.location_business_name || "—"}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Operator</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">${ag.placement_operator_company || "—"}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Machines</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">${ag.placement_machine_count || 0}x ${ag.placement_machine_type || "VendEra AI Machine"}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Term</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">${ag.placement_term_months || 0} months</td>
      </tr>
      ${ag.commission_type === "revenue_share" ? `<tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Compensation</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">${Number(ag.commission_pct || 0).toFixed(1)}% revenue share</td>
      </tr>` : ""}
      ${ag.commission_type === "flat_monthly" ? `<tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Compensation</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">$${Number(ag.commission_monthly_fee || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}/month</td>
      </tr>` : ""}
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Status</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#16a34a;font-size:13px;font-weight:600;">Fully Executed</td>
      </tr>
    </table>
    <p style="color:#374151;font-size:14px;line-height:1.6;">
      The fully signed agreement is attached to this email as a PDF for your records.
    </p>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="color:#9ca3af;font-size:11px;text-align:center;">${ag.placement_operator_company || "Vending Operator"}</p>
</div>` : `
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="text-align:center;padding:24px 0;border-bottom:2px solid #16a34a;">
    <span style="font-size:22px;font-weight:700;color:#16a34a;">Apex AI Vending</span>
  </div>
  <div style="padding:24px 0;">
    <h2 style="color:#111;font-size:18px;margin-bottom:16px;">Agreement Fully Executed</h2>
    <p style="color:#374151;font-size:14px;line-height:1.6;">
      The Purchase Agreement between <strong>Apex AI Vending LLC</strong> and
      <strong>${ag.operator_company_name || "Operator"}</strong> has been fully signed by both parties.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;">
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Operator</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;font-weight:600;">${ag.operator_company_name || "—"}</td>
      </tr>
      ${ag.include_equipment !== false && ag.machine_quantity > 0 ? `<tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Machine(s)</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">${ag.machine_quantity}x ${ag.machine_model || "VendEra AI Machine"}</td>
      </tr>` : ""}
      ${ag.include_location_services !== false && Number(ag.locations_purchased) > 0 ? `<tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Location Services</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#111;font-size:13px;">${ag.locations_purchased} location${ag.locations_purchased > 1 ? "s" : ""}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Total Due</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#16a34a;font-size:13px;font-weight:700;">$${totalDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#6b7280;font-size:13px;">Status</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#16a34a;font-size:13px;font-weight:600;">Fully Executed</td>
      </tr>
    </table>
    <p style="color:#374151;font-size:14px;line-height:1.6;">
      The fully signed agreement is attached to this email as a PDF for your records.
    </p>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
  <p style="color:#9ca3af;font-size:11px;text-align:center;">Apex AI Vending LLC &bull; vendingconnector.com</p>
</div>`;

      await getResend().emails.send({
        from: FROM_EMAIL,
        to: recipients,
        subject,
        html: html.trim(),
        attachments: [
          {
            filename: fileName,
            content: pdfBuffer,
          },
        ],
      });
    } catch {
      // Email is best-effort
    }
  }

  // Log activity
  const recipientSummary = isLocationPlacement
    ? `${ag.placement_operator_email || "operator"}, james@apexaivending.com${ag.rep_email ? `, ${ag.rep_email}` : ""}`
    : `${ag.operator_email || "operator"} and james@apexaivending.com`;
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreementId,
    activity_type: "signed_pdf_sent",
    description: `Fully signed PDF generated, emailed to ${recipientSummary}, and saved to account documents.`,
  });

  // Auto-create order + invoice for purchase agreements that don't
  // have a linked order yet (this is the e-sign-from-scratch path).
  //
  // Defense in depth against orphaned-by-deletion agreements: a
  // REPLACEMENT agreement (created via the supersession/reissue path)
  // supersedes a prior — typically already-invoiced — deal. If its order
  // was deleted (FK ON DELETE SET NULL leaves order_id NULL), it must NOT
  // reach this no-order branch and mint a duplicate order + invoice.
  // shouldAutoCreateOrderOnSign() blocks that; relink the replacement to
  // its restored order before signing instead.
  const isReplacement = !isLocationPlacement && !ag.order_id
    ? await agreementIsReplacement(ag.id)
    : false;
  if (
    shouldAutoCreateOrderOnSign({
      isLocationPlacement,
      autoSendInvoiceOnSigning: !!ag.auto_send_invoice_on_signing,
      hasLinkedOrder: !!ag.order_id,
      isReplacement,
    })
  ) {
    try {
      await autoCreateOrderAndSendInvoice(ag);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("agreement_activity_log").insert({
        agreement_id: agreementId,
        activity_type: "auto_invoice_failed",
        description: `Auto-invoice failed: ${msg}`,
      });
    }
  } else if (isReplacement && ag.auto_send_invoice_on_signing) {
    // A replacement with no linked order reached signing — record why no
    // order/invoice was auto-created so the orphaned state is visible.
    await supabaseAdmin.from("agreement_activity_log").insert({
      agreement_id: agreementId,
      activity_type: "auto_invoice_skipped",
      description:
        "Auto-create/invoice skipped: replacement agreement has no linked order (likely orphaned by order deletion). Relink it to its restored order before signing.",
    });
  }

  // For agreements that WERE generated from an existing order
  // (ag.order_id set), sync the order into awaiting_payment on
  // full execution and fire the invoice. This is the CRM path
  // where the customer + rep sign an agreement that already has
  // its target sales_order — before this, the order sat in draft
  // with agreement_status='signed' and the rep had to click
  // Send Invoice by hand. Signing is now the payment trigger.
  if (!isLocationPlacement && ag.order_id) {
    try {
      await supabaseAdmin
        .from("sales_orders")
        .update({
          order_status: "awaiting_payment",
          agreement_status: "signed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ag.order_id)
        // Only advance an order that hasn't been invoiced yet; don't
        // clobber a state past awaiting_payment (invoice already out,
        // deposit paid, etc.). awaiting_signature is where the flow
        // parks an order between "agreement sent" and "customer
        // signed" — see /api/sales/orders/[id]/process.
        .in("order_status", ["draft", "awaiting_customer_info", "awaiting_signature"]);

      const { sendInvoiceForSignedAgreement } = await import("./agreementInvoicing");
      const result = await sendInvoiceForSignedAgreement(agreementId);
      if (!result.ok) {
        await supabaseAdmin.from("agreement_activity_log").insert({
          agreement_id: agreementId,
          activity_type: "auto_invoice_failed",
          description: `Auto-invoice on signing failed: ${result.reason ?? "unknown"}`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("agreement_activity_log").insert({
        agreement_id: agreementId,
        activity_type: "auto_invoice_failed",
        description: `Auto-invoice on signing threw: ${msg}`,
      });
    }
  }

  // Auto-invoice the operator for the Apex Placement Fee on a fully-signed
  // location placement agreement (when the toggle is on AND a fee is set).
  if (
    isLocationPlacement &&
    ag.auto_send_invoice_on_signing &&
    Number(ag.apex_placement_fee) > 0 &&
    ag.apex_placement_invoice_status !== "sent" &&
    ag.apex_placement_invoice_status !== "paid"
  ) {
    try {
      await sendApexPlacementFeeInvoice(ag);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("agreement_activity_log").insert({
        agreement_id: agreementId,
        activity_type: "auto_invoice_failed",
        description: `Apex placement fee invoice failed: ${msg}`,
      });
    }
  }

  // Auto-create marketplace contract when send_to_marketplace is toggled on.
  // Only fires for machine-purchase agreements (location placements have their
  // own commission flow and aren't a fit for the location marketplace).
  if (!isLocationPlacement && ag.send_to_marketplace && !ag.marketplace_contract_id) {
    try {
      const { createContractFromAgreement } = await import("./marketplaceHandoff");
      const contractId = await createContractFromAgreement(agreementId);
      if (contractId) {
        await supabaseAdmin.from("agreement_activity_log").insert({
          agreement_id: agreementId,
          activity_type: "marketplace_contract_created",
          description: `Marketplace contract ${contractId.slice(0, 8)} auto-created for placement partners`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin.from("agreement_activity_log").insert({
        agreement_id: agreementId,
        activity_type: "marketplace_contract_failed",
        description: `Marketplace contract auto-creation failed: ${msg}`,
      });
    }
  }

  // Spawn Workflows fulfillment records. Best-effort — a workflow
  // failure never breaks the underlying signing transaction.
  try {
    const { spawnFromPurchaseAgreement } = await import("./workflows/hooks");
    const created = await spawnFromPurchaseAgreement(agreementId);
    if (created.length > 0) {
      await supabaseAdmin.from("agreement_activity_log").insert({
        agreement_id: agreementId,
        activity_type: "workflows_created",
        description: `Created ${created.length} fulfillment workflow${created.length > 1 ? "s" : ""}: ${created
          .map((w) => `${w.workflow_type}#${w.workflow_number}`)
          .join(", ")}`,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin.from("agreement_activity_log").insert({
      agreement_id: agreementId,
      activity_type: "workflows_failed",
      description: `Workflow auto-creation failed: ${msg}`,
    });
  }
}

/* ================================================================== */
/*  sendApexPlacementFeeInvoice                                       */
/*  Bills the operator (placement_operator_email) for the Apex        */
/*  Placement Fee. Uses QuickBooks if configured, falls back to       */
/*  Resend. Records status on the agreement row.                      */
/* ================================================================== */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendApexPlacementFeeInvoice(ag: any): Promise<void> {
  const amount = Number(ag.apex_placement_fee) || 0;
  if (amount <= 0) return;

  const recipientEmail = ag.placement_operator_email;
  if (!recipientEmail) {
    throw new Error("Operator email missing — cannot send placement fee invoice");
  }

  const operatorName = ag.placement_operator_company || ag.placement_operator_contact || "Operator";
  const locationName = ag.location_business_name || "Location";

  let qbInvoiceId: string | null = null;
  let qbSent = false;
  const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);

  if (qbConfigured) {
    try {
      const { createInvoice, sendInvoiceEmail } = await import("@/lib/quickbooks");
      const invoicePromise = createInvoice({
        customerEmail: recipientEmail,
        customerName: operatorName,
        customerPhone: ag.placement_operator_phone || undefined,
        lineItems: [
          {
            description: `Location Placement Services — ${locationName}`,
            amount,
            quantity: 1,
          },
        ],
        memo: `Apex Placement Fee — Agreement #${(ag.id || "").slice(0, 8).toUpperCase()}`,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("QB timeout")), 8000),
      );
      const invoice = await Promise.race([invoicePromise, timeoutPromise]);
      qbInvoiceId = invoice.Id;

      await Promise.race([
        sendInvoiceEmail(invoice.Id, recipientEmail),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("QB email timeout")), 5000),
        ),
      ]);
      qbSent = true;
    } catch {
      // Fall through to Resend
    }
  }

  if (!qbSent && process.env.RESEND_API_KEY) {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: recipientEmail,
      cc: ["james@apexaivending.com"],
      subject: `Invoice — Location Placement Services for ${locationName}`,
      html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Apex AI Vending</h1>
    <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">Location Placement Services Invoice</p>
  </div>
  <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      Hello ${ag.placement_operator_contact || operatorName},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      The Location Placement Agreement for <strong>${locationName}</strong> has been fully executed. Please find your invoice for placement services below.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
      <thead>
        <tr style="background:#e5e7eb;">
          <th style="padding:8px 12px;text-align:left;color:#374151;">Item</th>
          <th style="padding:8px 12px;text-align:right;color:#374151;">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111;">
            Location Placement Services — ${locationName}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;">
            $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </td>
        </tr>
      </tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:8px 0 0;color:#111;font-weight:700;">Total Due</td>
        <td style="padding:8px 0 0;text-align:right;color:#16a34a;font-weight:700;font-size:18px;">
          $${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </td>
      </tr>
    </table>
    ${ag.apex_placement_fee_notes ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;"><strong>Notes:</strong> ${ag.apex_placement_fee_notes}</p>` : ""}
  </div>
  <p style="font-size:13px;color:#6b7280;text-align:center;">
    Questions? Contact us at <a href="mailto:james@apexaivending.com" style="color:#16a34a;">james@apexaivending.com</a>
    or call <a href="tel:+18888511462" style="color:#16a34a;">(888) 851-1462</a>
  </p>
</div>
      `.trim(),
    });
  } else if (!qbSent) {
    throw new Error("No email service available — set RESEND_API_KEY or QuickBooks creds");
  }

  await supabaseAdmin
    .from("purchase_agreements")
    .update({
      apex_placement_invoice_status: "sent",
      apex_placement_invoice_sent_at: new Date().toISOString(),
      apex_placement_qb_invoice_id: qbInvoiceId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", ag.id);

  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: ag.id,
    activity_type: "apex_placement_invoice_sent",
    description: `Apex Placement Fee invoice ($${amount.toFixed(2)}) sent to ${recipientEmail}`,
  });
}

/* ================================================================== */
/*  autoCreateOrderAndSendInvoice                                     */
/*  Builds a sales_order from an agreement and sends the invoice in   */
/*  a separate email so the operator can pay (mirrors create-order +  */
/*  orders/[id]/send routes).                                         */
/* ================================================================== */
/** True when the agreement was created via the supersession/reissue path
 *  (logged as 'created_as_replacement'). Such an agreement supersedes an
 *  existing deal, so signing it must never auto-mint a fresh order+invoice
 *  from the no-order path — that would duplicate the original. */
async function agreementIsReplacement(agreementId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("agreement_activity_log")
    .select("id")
    .eq("agreement_id", agreementId)
    .eq("activity_type", "created_as_replacement")
    .limit(1)
    .maybeSingle();
  return !!data;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function autoCreateOrderAndSendInvoice(ag: any): Promise<void> {
  // Rebuild the order from the agreement's line-item snapshot so every
  // line comes back exactly as it went in. This function used to be a
  // near-identical copy of the create-order route, both reconstructing
  // only machine / location / freight lines from scalar columns with
  // discount_percent hardcoded to 0 — which meant signing an agreement
  // produced an order missing its coffee, cooler and financing lines.
  const items = buildOrderItemsFromAgreement(ag) as Array<Record<string, unknown>>;
  if (items.length === 0) return;

  // Upfront total excludes the deferred location-services balance.
  // Totals read through the canonical calculator so a $0 / 100%-
  // discounted line stays $0 instead of being repriced to full.
  const upfrontItems = items.filter((i) => i.status !== "pending_fulfillment");
  const totalValue = sumLines(upfrontItems as LineItemLike[]);

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      account_id: ag.account_id || null,
      created_by: ag.created_by,
      assigned_rep_id: ag.created_by,
      total_value: totalValue,
      status: "draft",
      order_status: "awaiting_payment",
      document_type: "order",
      order_type: "machine_purchase",
      deposit_amount: 0,
      deposit_paid: false,
      remaining_balance: totalValue,
      payment_status: "unpaid",
      invoice_status: "not_sent",
      agreement_status: "signed",
      fulfillment_status: "pending",
      next_required_action: "Awaiting payment",
      recipient_email: ag.operator_email || null,
      notes: `Auto-created from fully-signed agreement. Operator: ${ag.operator_company_name || ""}. ${ag.machine_quantity || 1}x ${ag.machine_model || "VendEra AI Machine"}.`,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (orderErr || !order) {
    throw new Error(`Failed to create order: ${orderErr?.message || "unknown"}`);
  }

  const orderItems = items.map((item) => ({
    order_id: order.id,
    ...item,
    location_deposit_paid: false,
  }));
  await supabaseAdmin.from("order_items").insert(orderItems);

  await supabaseAdmin
    .from("purchase_agreements")
    .update({ order_id: order.id, updated_at: new Date().toISOString() })
    .eq("id", ag.id);

  // Try QuickBooks invoice first if configured
  let qbInvoiceId: string | null = null;
  let qbSent = false;
  const qbConfigured = !!(process.env.QB_CLIENT_ID && process.env.QB_CLIENT_SECRET);

  if (qbConfigured && ag.operator_email) {
    try {
      const { createInvoice, sendInvoiceEmail } = await import("@/lib/quickbooks");
      // Bill the DISCOUNTED per-unit rate. QuickBooks multiplies
      // quantity by amount, so passing the list unit_price overstated
      // every discounted line.
      const lineItems = upfrontItems.map((item) => {
        const quantity = Number(item.quantity) || 1;
        const total = lineTotal(item as LineItemLike);
        return {
          description: String(item.service_name || "Service"),
          amount: Math.round((total / quantity + Number.EPSILON) * 100) / 100,
          quantity,
        };
      });

      const invoicePromise = createInvoice({
        customerEmail: ag.operator_email,
        customerName: ag.operator_company_name || ag.operator_legal_name || "Customer",
        customerPhone: ag.operator_phone || undefined,
        lineItems,
        memo: `Order #${order.order_number || order.id.slice(0, 8).toUpperCase()} (from agreement)`,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("QB timeout")), 8000)
      );
      const invoice = await Promise.race([invoicePromise, timeoutPromise]);
      qbInvoiceId = invoice.Id;

      await Promise.race([
        sendInvoiceEmail(invoice.Id, ag.operator_email),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("QB email timeout")), 5000)),
      ]);
      qbSent = true;

      // Persist canonically to public.invoices + link financial_spine_invoice_id.
      // sales_orders has no qb_invoice_id column; the QB identity lives on the
      // invoices row (idempotent by provider+provider_invoice_id).
      const inv = await upsertInvoice({
        provider: "quickbooks",
        providerInvoiceId: qbInvoiceId,
        orderId: order.id,
        agreementId: ag.id,
        buyerEmail: ag.operator_email,
        buyerName: ag.operator_company_name || ag.operator_legal_name || "Customer",
        totalCents: Math.round(Number(totalValue) * 100),
        status: "open",
        sentAt: new Date().toISOString(),
        memo: `Order #${order.order_number || order.id.slice(0, 8).toUpperCase()} (from agreement)`,
      }).catch(() => null);
      await supabaseAdmin
        .from("sales_orders")
        .update({
          ...(inv ? { financial_spine_invoice_id: inv.id } : {}),
          invoice_status: "sent",
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
    } catch {
      // Fall through to Resend
    }
  }

  // Fallback: send invoice via Resend if QB didn't succeed
  if (!qbSent && process.env.RESEND_API_KEY && ag.operator_email) {
    const itemRows = upfrontItems
      .map((item) => {
        const qty = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price) || 0;
        // Authoritative stored total via the canonical calculator. The
        // old `Number(total_price) || qty * unitPrice` idiom repriced a
        // $0 or 100%-discounted line back to full because 0 is falsy.
        const rowTotal = lineTotal(item as LineItemLike);
        return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111;">${item.service_name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">${qty}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;">$${unitPrice.toFixed(2)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;">$${rowTotal.toFixed(2)}</td>
          </tr>`;
      })
      .join("");

    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: ag.operator_email,
        cc: ["james@apexaivending.com"],
        subject: `Invoice — Order #${order.order_number || order.id.slice(0, 8).toUpperCase()} (Apex AI Vending)`,
        html: `
<div style="max-width:640px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px 24px;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Apex AI Vending</h1>
    <p style="color:#6b7280;font-size:14px;margin:4px 0 0;">Invoice for Order #${order.order_number || order.id.slice(0, 8).toUpperCase()}</p>
  </div>

  <div style="background:#f9fafb;border-radius:12px;padding:24px;margin-bottom:24px;">
    <p style="margin:0 0 16px;font-size:14px;color:#374151;">
      Hello ${ag.operator_legal_name || ag.operator_company_name || "there"},
    </p>
    <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
      Thank you for executing your purchase agreement with Apex AI Vending. The invoice for your order is below.
      Please remit payment to begin procurement.
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
      <thead>
        <tr style="background:#e5e7eb;">
          <th style="padding:8px 12px;text-align:left;color:#374151;">Item</th>
          <th style="padding:8px 12px;text-align:center;color:#374151;">Qty</th>
          <th style="padding:8px 12px;text-align:right;color:#374151;">Unit</th>
          <th style="padding:8px 12px;text-align:right;color:#374151;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:16px;">
      <tr style="border-top:2px solid #e5e7eb;">
        <td style="padding:8px 0 0;color:#111;font-weight:700;">Total Due</td>
        <td style="padding:8px 0 0;text-align:right;color:#16a34a;font-weight:700;font-size:18px;">$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
      </tr>
    </table>

    ${ag.payment_method_notes ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:12px;"><strong>Payment Instructions:</strong> ${ag.payment_method_notes}</p>` : ""}
  </div>

  <p style="font-size:13px;color:#6b7280;text-align:center;">
    Questions about this invoice? Contact us at
    <a href="mailto:james@apexaivending.com" style="color:#16a34a;">james@apexaivending.com</a>
    or call <a href="tel:+18888511462" style="color:#16a34a;">(888) 851-1462</a>
  </p>
</div>
        `.trim(),
      });

      await supabaseAdmin
        .from("sales_orders")
        .update({ invoice_status: "sent", updated_at: new Date().toISOString() })
        .eq("id", order.id);
    } catch (e) {
      throw new Error(`Resend invoice failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: ag.id,
    activity_type: "auto_invoice_sent",
    description: `Order #${order.order_number || order.id.slice(0, 6)} auto-created and invoice sent to ${ag.operator_email}`,
  });
}
