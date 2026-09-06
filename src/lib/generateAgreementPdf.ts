import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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
import { initialsKeyFor, type AgreementSectionId } from "@/lib/agreements/sections";
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

  function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawWrapped(
    text: string,
    font: PDFFont,
    size: number,
    color = gray,
    indent = 0,
  ) {
    // Preserve author-provided paragraph breaks by splitting on newlines
    // first, then word-wrap each paragraph.
    const safe = pdfSafeMultiline(text);
    const paragraphs = safe.split("\n");
    for (let p = 0; p < paragraphs.length; p++) {
      const para = paragraphs[p];
      if (para === "") {
        // Blank line — just advance
        checkPage(size + 4);
        y -= size + 4;
        continue;
      }
      const lines = wrapText(para, font, size, MAX_W - indent);
      for (const line of lines) {
        checkPage(size + 6);
        drawText(page, line, LEFT + indent, y, font, size, color);
        y -= size + 4;
      }
    }
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

  function labelValue(label: string, value: string) {
    checkPage(18);
    drawText(page, label, LEFT, y, helvetica, 8, gray);
    drawText(page, value || "—", LEFT + 180, y, helveticaBold, 9, dark);
    y -= 16;
  }

  function money(n: unknown): string {
    const num = Number(n) || 0;
    return `$${num.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  }

  const effectiveDate = ag.effective_date
    ? new Date(ag.effective_date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "________________";

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

  drawText(page, "SERVICE PROVIDER", LEFT, y, helveticaBold, 8, gray);
  drawText(page, "OPERATOR", LEFT + 260, y, helveticaBold, 8, gray);
  y -= 16;
  drawText(page, ag.apex_company_name || "Apex AI Vending LLC", LEFT, y, helveticaBold, 10, dark);
  drawText(page, ag.operator_company_name || "—", LEFT + 260, y, helveticaBold, 10, dark);
  y -= 14;
  drawText(page, ag.apex_representative_name || "—", LEFT, y, helvetica, 9, gray);
  drawText(page, ag.operator_legal_name || "—", LEFT + 260, y, helvetica, 9, gray);
  y -= 14;
  drawText(page, ag.apex_representative_email || "", LEFT, y, helvetica, 8, gray);
  drawText(page, ag.operator_email || "", LEFT + 260, y, helvetica, 8, gray);
  y -= 14;
  drawText(page, "", LEFT, y, helvetica, 8, gray);
  drawText(page, ag.operator_phone || "", LEFT + 260, y, helvetica, 8, gray);
  y -= 20;

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

  function sectionHeaderNum(num: number, title: string) {
    checkPage(34);
    y -= 12;
    drawLine(y + 6);
    y -= 6;
    drawText(page, `Section ${num}: ${title}`, LEFT, y, helveticaBold, 9, dark);
    y -= 16;
  }

  function scheduleHeader(title: string) {
    checkPage(40);
    y -= 10;
    drawLine(y);
    y -= 20;
    drawText(page, title.toUpperCase(), LEFT, y, helveticaBold, 10, green);
    y -= 20;
  }

  function drawParagraph(block: ClauseBlock) {
    if (block.kind !== "p") return;
    const text = block.label ? `${block.label} ${block.text}` : block.text;
    drawWrapped(text, helvetica, 8.5, block.caps ? dark : gray);
    y -= 2;
  }

  function truncateTo(text: string, font: PDFFont, size: number, maxWidth: number): string {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
    let out = text;
    while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
      out = out.slice(0, -1);
    }
    return `${out}...`;
  }

  function drawRightAt(text: string, font: PDFFont, size: number, color = dark) {
    drawText(page, text, RIGHT - 4 - font.widthOfTextAtSize(text, size), y, font, size, color);
  }

  // Schedule A: every line on the order, verbatim from the Phase-1
  // snapshot — so coffee, coolers, financing and custom lines all appear
  // in the signed contract, not just equipment.
  function drawLineItemsTable() {
    const COL_ITEM = LEFT + 4;
    const COL_CAT = LEFT + 190;
    const COL_QTY = LEFT + 296;
    const COL_UNIT = LEFT + 336;
    const COL_DISC = LEFT + 410;

    const drawItemHeader = () => {
      page.drawRectangle({ x: LEFT, y: y - 4, width: MAX_W, height: 18, color: lightBg });
      drawText(page, "Item", COL_ITEM, y, helveticaBold, 8, dark);
      drawText(page, "Category", COL_CAT, y, helveticaBold, 8, dark);
      drawText(page, "Qty", COL_QTY, y, helveticaBold, 8, dark);
      drawText(page, "Unit Price", COL_UNIT, y, helveticaBold, 8, dark);
      drawText(page, "Disc", COL_DISC, y, helveticaBold, 8, dark);
      drawRightAt("Line Total", helveticaBold, 8, dark);
      y -= 18;
    };

    if (snapshotLines.length > 0) {
      checkPage(50);
      drawItemHeader();
      for (const line of snapshotLines) {
        const before = y;
        checkPage(30);
        if (y > before) drawItemHeader();
        drawText(page, truncateTo(line.service_name || "Item", helvetica, 8.5, 178), COL_ITEM, y, helvetica, 8.5, dark);
        drawText(page, truncateTo(CATEGORY_LABEL[line.category] ?? "Other", helvetica, 8, 100), COL_CAT, y, helvetica, 8, gray);
        drawText(page, String(line.quantity ?? 1), COL_QTY, y, helvetica, 8.5, dark);
        drawText(page, money(line.unit_price), COL_UNIT, y, helvetica, 8.5, dark);
        drawText(
          page,
          Number(line.discount_percent) > 0 ? `${Number(line.discount_percent)}%` : "—",
          COL_DISC, y, helvetica, 8.5,
          Number(line.discount_percent) > 0 ? green : gray,
        );
        drawRightAt(money(line.total_price), helveticaBold, 8.5, dark);
        y -= 14;
        if (line.description) {
          drawText(page, truncateTo(String(line.description), helvetica, 7.5, MAX_W - 20), COL_ITEM + 6, y, helvetica, 7.5, gray);
          y -= 12;
        }
        if (line.deferred) {
          drawText(page, "Invoiced on fulfillment — not included in the amount due prior to procurement", COL_ITEM + 6, y, helvetica, 7.5, gray);
          y -= 12;
        }
        drawLine(y + 4);
        y -= 6;
      }
    } else {
      // Pre-snapshot fallback — only equipment scalars are expressible.
      labelValue("Machine Model", v.model);
      labelValue("Quantity", String(v.qty));
      labelValue("Unit Price", v.unitPrice);
      labelValue("Equipment Subtotal", v.subtotal);
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
        checkPage(30);
        drawText(page, "Total Due Prior to Procurement", LEFT + 4, y, helveticaBold, 10, dark);
        drawText(page, v.totalDue, RIGHT - 4 - helveticaBold.widthOfTextAtSize(v.totalDue, 12), y, helveticaBold, 12, green);
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
  /*  SIGNATURE BLOCKS                                                */
  /* ================================================================ */
  checkPage(160);
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

  const operatorSig = signatures.find((s: { signer_type: string }) => s.signer_type === "operator");
  const apexSig = signatures.find((s: { signer_type: string }) => s.signer_type === "apex");

  // Operator signature block
  drawText(page, "OPERATOR", LEFT, y, helveticaBold, 9, gray);
  y -= 20;
  if (operatorSig) {
    drawText(page, operatorSig.signature_data, LEFT, y, helveticaBold, 14, dark);
    y -= 8;
  }
  drawLine(y + 2);
  drawText(page, "Signature", LEFT, y - 10, helvetica, 8, gray);
  if (operatorSig) {
    drawText(page, `Electronically signed`, LEFT + 100, y - 10, helvetica, 7, green);
  }
  y -= 28;
  if (operatorSig) {
    drawText(page, operatorSig.signer_name, LEFT, y + 6, helveticaBold, 10, dark);
  }
  drawLine(y + 2);
  drawText(page, "Printed Name", LEFT, y - 10, helvetica, 8, gray);
  if (ag.operator_signed_at) {
    drawText(page, `Signed: ${new Date(ag.operator_signed_at).toLocaleDateString()}`, LEFT + 300, y - 10, helvetica, 8, green);
  }
  y -= 28;
  if (operatorSig?.signer_title) {
    drawText(page, operatorSig.signer_title, LEFT, y + 6, helvetica, 9, dark);
  }
  drawLine(y + 2);
  drawText(page, "Title", LEFT, y - 10, helvetica, 8, gray);
  y -= 28;
  if (ag.operator_signed_at) {
    drawText(page, new Date(ag.operator_signed_at).toLocaleDateString(), LEFT, y + 6, helvetica, 9, dark);
  }
  drawLine(y + 2);
  drawText(page, "Date", LEFT, y - 10, helvetica, 8, gray);
  if (operatorSig?.signer_company) {
    y -= 16;
    drawText(page, `Company: ${operatorSig.signer_company}`, LEFT, y, helvetica, 8, gray);
  }
  if (operatorSig?.signer_email) {
    y -= 14;
    drawText(page, `Email: ${operatorSig.signer_email}`, LEFT, y, helvetica, 8, gray);
  }
  if (operatorSig?.ip_address) {
    y -= 14;
    drawText(page, `IP: ${operatorSig.ip_address}`, LEFT, y, helvetica, 7, gray);
  }

  y -= 30;

  // Apex signature block
  checkPage(160);
  drawText(page, "APEX AI VENDING LLC", LEFT, y, helveticaBold, 9, gray);
  y -= 20;
  if (apexSig) {
    drawText(page, apexSig.signature_data, LEFT, y, helveticaBold, 14, dark);
    y -= 8;
  }
  drawLine(y + 2);
  drawText(page, "Signature", LEFT, y - 10, helvetica, 8, gray);
  if (apexSig) {
    drawText(page, `Electronically signed`, LEFT + 100, y - 10, helvetica, 7, green);
  }
  y -= 28;
  if (apexSig) {
    drawText(page, apexSig.signer_name, LEFT, y + 6, helveticaBold, 10, dark);
  }
  drawLine(y + 2);
  drawText(page, "Printed Name", LEFT, y - 10, helvetica, 8, gray);
  if (ag.apex_signed_at) {
    drawText(page, `Signed: ${new Date(ag.apex_signed_at).toLocaleDateString()}`, LEFT + 300, y - 10, helvetica, 8, green);
  }
  y -= 28;
  if (apexSig?.signer_title) {
    drawText(page, apexSig.signer_title, LEFT, y + 6, helvetica, 9, dark);
  }
  drawLine(y + 2);
  drawText(page, "Title", LEFT, y - 10, helvetica, 8, gray);
  y -= 28;
  if (ag.apex_signed_at) {
    drawText(page, new Date(ag.apex_signed_at).toLocaleDateString(), LEFT, y + 6, helvetica, 9, dark);
  }
  drawLine(y + 2);
  drawText(page, "Date", LEFT, y - 10, helvetica, 8, gray);
  if (apexSig?.signer_email) {
    y -= 16;
    drawText(page, `Email: ${apexSig.signer_email}`, LEFT, y, helvetica, 8, gray);
  }

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
  if (!isLocationPlacement && ag.auto_send_invoice_on_signing && !ag.order_id) {
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

      await supabaseAdmin
        .from("sales_orders")
        .update({ qb_invoice_id: qbInvoiceId, invoice_status: "sent" })
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
