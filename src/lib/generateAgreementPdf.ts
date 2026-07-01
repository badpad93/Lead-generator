import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { pdfSafeInline, pdfSafeMultiline } from "./pdfSafeText";

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

  function sectionHeader(num: number, title: string) {
    checkPage(34);
    y -= 12;
    drawLine(y + 6);
    y -= 6;
    drawText(page, `Section ${num}: ${title}`, LEFT, y, helveticaBold, 9, dark);
    y -= 16;
    currentSectionNum = num;
    currentScheduleKey = "";
  }

  const SECTION_KEY_MAP: Record<number, string> = {
    3: "section_3", 4: "section_4", 5: "section_5", 6: "section_6",
    7: "section_7", 8: "section_8",
  };
  const SCHEDULE_KEY_MAP: Record<string, string> = {
    A: "schedule_a", B: "schedule_b", C: "schedule_c",
  };
  let currentSectionNum = 0;
  let currentScheduleKey = "";

  function getInitialsForSection(): string | null {
    const key = currentScheduleKey
      ? SCHEDULE_KEY_MAP[currentScheduleKey]
      : SECTION_KEY_MAP[currentSectionNum];
    if (!key) return null;
    const found = initials.find(
      (i: { section_key: string; signer_type: string }) =>
        i.section_key === key && i.signer_type === "operator",
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
    "VendEra AI Machine Purchase & Services Agreement",
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
  /*  SECTIONS 1-31                                                   */
  /* ================================================================ */

  sectionHeader(1, "Recitals");
  drawWrapped(
    `This VendEra AI Machine Purchase & Services Agreement ("Agreement") is entered into as of ${effectiveDate} by and between ${ag.apex_company_name || "Apex AI Vending LLC"} ("Apex" or "Company") and ${ag.operator_company_name || "[Operator]"} ("Operator"). Apex is engaged in the business of selling VendEra AI vending machines and providing related location procurement services. The Operator desires to purchase VendEra AI machines and optionally engage Apex for location services.`,
    helvetica, 8.5, gray,
  );

  sectionHeader(2, "Definitions");
  const definitions = [
    `"VendEra AI Machine" means the smart vending machine model ${ag.machine_model || "[Model]"} manufactured or distributed by Apex.`,
    `"Location Services" means Apex's service of identifying, vetting, and securing commercial locations for machine placement.`,
    `"Procurement" means the ordering, manufacturing, and preparation of machines for delivery.`,
    `"Effective Date" means ${effectiveDate}.`,
  ];
  for (const def of definitions) {
    drawWrapped(`• ${def}`, helvetica, 8.5, gray, 8);
    y -= 2;
  }

  const includeEquipment = ag.include_equipment !== false;
  const includeLocationServices = ag.include_location_services !== false;
  const includeShippingStorage = ag.include_shipping_storage !== false;

  if (includeEquipment) {
    sectionHeader(3, "Equipment Purchase");
    labelValue("Machine Model", ag.machine_model || "—");
    labelValue("Quantity", String(ag.machine_quantity || 0));
    labelValue("Unit Price", money(ag.machine_unit_price));
    labelValue("Equipment Subtotal", money(ag.equipment_subtotal));
    y -= 4;
    drawWrapped(
      "Operator agrees to purchase the above-described VendEra AI Machine(s) at the stated unit price. All machines are new and come with standard manufacturer warranties. Apex warrants that machines will be free from defects in materials and workmanship for a period of twelve (12) months from delivery.",
      helvetica, 8.5, gray,
    );
    initialsPlaceholder();
  }

  if (includeLocationServices) {
    sectionHeader(4, "Location Services");
    labelValue("Locations Purchased", String(ag.locations_purchased || 0));
    labelValue("Fee per Location Secured", money(ag.location_fee_per_secured));
    labelValue("Max Location Service Value", money(ag.max_location_service_value));
    labelValue("Rejection Allowance", ag.location_rejection_allowance || "Per service terms");
    labelValue("Service Timeline", ag.location_service_timeline_days ? `${ag.location_service_timeline_days} days` : "Per service terms");
    if (ag.location_services_deposit_only) {
      const deposit = Math.min(Number(ag.location_services_deposit_amount) || 0, Number(ag.max_location_service_value) || 0);
      const remaining = Math.max(0, Number(ag.max_location_service_value) - deposit);
      labelValue("Deposit Due Upfront", money(deposit));
      labelValue("Balance Due on Fulfillment", money(remaining));
    }
    y -= 4;
    drawWrapped(
      "If Operator has elected location services, Apex will identify and secure suitable commercial locations for machine placement. Each location will meet minimum traffic and suitability criteria. Operator may reject a proposed location within the allowance specified above; additional rejections may incur supplemental fees.",
      helvetica, 8.5, gray,
    );
    if (ag.location_services_deposit_only) {
      y -= 4;
      const deposit = Math.min(Number(ag.location_services_deposit_amount) || 0, Number(ag.max_location_service_value) || 0);
      const remaining = Math.max(0, Number(ag.max_location_service_value) - deposit);
      drawWrapped(
        `Payment Schedule: A non-refundable deposit of ${money(deposit)} is due prior to procurement. The remaining balance of ${money(remaining)} shall be invoiced upon fulfillment of secured locations and is due on receipt.`,
        helvetica, 8.5, gray,
      );
    }
    initialsPlaceholder();
  }

  if (includeShippingStorage) {
    sectionHeader(5, "Shipping & Storage");
    labelValue("Freight per Machine", money(ag.freight_per_machine));
    labelValue(`Freight Total (${ag.machine_quantity || 0} machine${(ag.machine_quantity || 0) === 1 ? "" : "s"})`, money(ag.freight_total));
    if (Number(ag.standard_freight_rate) > 0) labelValue("Standard Freight Rate", money(ag.standard_freight_rate));
    if (Number(ag.discounted_freight_rate) > 0) labelValue("Discounted Freight Rate", money(ag.discounted_freight_rate));
    labelValue("Storage Fee per Machine / Month", money(ag.storage_fee_per_machine_month));
    labelValue("Free Storage Period", `${ag.free_storage_months || 0} month${(ag.free_storage_months || 0) === 1 ? "" : "s"}`);
    y -= 4;
    drawWrapped(
      "Freight charges cover shipping from the distribution center to the Operator's designated delivery address. Machines are shipped via common carrier. Risk of loss transfers to Operator upon delivery. Storage fees apply if Operator is unable to accept delivery within the free storage period.",
      helvetica, 8.5, gray,
    );
    initialsPlaceholder();
  }

  sectionHeader(6, "Payment Terms");
  labelValue("Total Due Prior to Procurement", money(ag.total_due_prior_to_procurement));
  labelValue("Payment Due Date", ag.payment_due_date || "Upon execution");
  labelValue("Payment Method", ag.payment_method_notes || "Wire transfer, ACH, or certified check");
  y -= 4;
  drawWrapped(
    "Full payment of the Total Due Prior to Procurement is required before Apex will initiate machine procurement or begin location services. Late payments are subject to a 1.5% monthly interest charge. Returned payments incur a $50 processing fee.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  sectionHeader(7, "Delivery & Installation");
  drawWrapped(
    "Apex will coordinate delivery to the Operator's specified address. Standard delivery timeframe is 4-8 weeks from payment confirmation, subject to manufacturer availability. Operator is responsible for ensuring adequate site preparation including electrical access (standard 120V outlet), sufficient floor space, and ADA-compliant placement. Apex may offer optional installation services at additional cost.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  sectionHeader(8, "Warranties & Representations");
  drawWrapped(
    "Apex warrants that: (a) all machines are new and conform to published specifications; (b) machines will be free from material defects for 12 months from delivery; (c) Apex has authority to sell the machines; (d) location services will be performed with reasonable care and diligence. THE FOREGOING WARRANTIES ARE EXCLUSIVE AND IN LIEU OF ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  const remainingSections: Array<{ num: number; title: string; text: string }> = [
    { num: 9, title: "Intellectual Property", text: "The VendEra AI software, branding, and proprietary systems remain the exclusive intellectual property of Apex. Operator receives a non-exclusive, non-transferable license to use the machine software for its intended vending purpose. Operator shall not reverse engineer, modify, or create derivative works from any Apex software or technology." },
    { num: 10, title: "Data & Telemetry", text: "VendEra AI machines transmit operational data including sales, inventory, and performance metrics. Apex and Operator both have access to machine performance data via the VendEra dashboard. Apex may use aggregated, anonymized data for product improvement. Operator owns all customer transaction data collected at their locations." },
    { num: 11, title: "Maintenance & Support", text: "Apex provides technical support via phone and email during business hours. Warranty repairs are covered under the 12-month warranty. Post-warranty repairs and parts are available at published rates. Operator is responsible for routine cleaning and restocking of machines." },
    { num: 12, title: "Insurance", text: "Operator shall maintain general commercial liability insurance with minimum coverage of $1,000,000 per occurrence covering the machines and their operation. Apex maintains product liability insurance for manufacturing defects. Certificates of insurance shall be provided upon request." },
    { num: 13, title: "Indemnification", text: "Each party agrees to indemnify, defend, and hold harmless the other party from claims, damages, and expenses arising from: (a) the indemnifying party's negligence or willful misconduct; (b) breach of this Agreement; (c) violation of applicable laws. Operator indemnifies Apex against claims arising from machine operation, placement, and customer interactions at Operator's locations." },
    { num: 14, title: "Limitation of Liability", text: "IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES. APEX'S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED THE TOTAL AMOUNT PAID BY OPERATOR UNDER THIS AGREEMENT. These limitations apply regardless of the form of action, whether in contract, tort, strict liability, or otherwise." },
    { num: 15, title: "Confidentiality", text: "Both parties agree to maintain the confidentiality of proprietary information disclosed in connection with this Agreement, including pricing, business plans, customer data, and technical specifications. Confidentiality obligations survive termination for a period of two (2) years." },
    { num: 16, title: "Term & Termination", text: "This Agreement is effective as of the Effective Date and continues until all obligations are fulfilled. Either party may terminate for material breach upon 30 days' written notice if the breach remains uncured. Upon termination, payment obligations for delivered machines and completed services remain in effect." },
    { num: 17, title: "Force Majeure", text: "Neither party shall be liable for delays or failures in performance caused by events beyond reasonable control, including natural disasters, pandemics, government actions, supply chain disruptions, or shipping carrier delays. The affected party shall promptly notify the other and use reasonable efforts to mitigate the impact." },
    { num: 18, title: "Assignment", text: "Neither party may assign this Agreement without the prior written consent of the other party, except that either party may assign to an affiliate or successor in connection with a merger, acquisition, or sale of substantially all assets." },
    { num: 19, title: "Governing Law", text: `This Agreement shall be governed by and construed in accordance with the laws of the State of ${ag.governing_state || "Nevada"}, without regard to conflict of law principles.` },
    { num: 20, title: "Dispute Resolution", text: `Any dispute arising under this Agreement shall first be subject to good-faith negotiation for 30 days. If unresolved, disputes shall be submitted to binding arbitration in ${ag.venue_state || ag.governing_state || "Nevada"} under the rules of the American Arbitration Association. The prevailing party shall be entitled to recover reasonable attorney's fees.` },
    { num: 21, title: "Notices", text: "All notices under this Agreement shall be in writing and delivered by email (with read receipt), certified mail, or overnight courier to the addresses specified in this Agreement. Notices are effective upon confirmed receipt." },
    { num: 22, title: "Entire Agreement", text: "This Agreement constitutes the entire agreement between the parties regarding its subject matter and supersedes all prior negotiations, representations, and agreements. No amendment or modification shall be effective unless in writing and signed by both parties." },
    { num: 23, title: "Severability", text: "If any provision of this Agreement is held to be invalid or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable." },
    { num: 24, title: "Waiver", text: "The failure of either party to enforce any right or provision of this Agreement shall not constitute a waiver of such right or provision. Any waiver must be in writing and signed by the waiving party." },
    { num: 25, title: "Counterparts", text: "This Agreement may be executed in counterparts, each of which shall be deemed an original. Electronic signatures shall be deemed original signatures for all purposes." },
    { num: 26, title: "Survival", text: "Provisions regarding payment obligations, warranties, indemnification, limitation of liability, confidentiality, intellectual property, and dispute resolution shall survive termination or expiration of this Agreement." },
    { num: 27, title: "Independent Contractors", text: "The parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, agency, or employment relationship between the parties." },
    { num: 28, title: "Compliance with Laws", text: "Both parties shall comply with all applicable federal, state, and local laws, regulations, and ordinances in the performance of this Agreement, including health and safety regulations applicable to vending operations." },
    { num: 29, title: "Publicity", text: "Neither party shall use the other party's name, logo, or trademarks in any publicity, advertising, or marketing materials without prior written consent." },
    { num: 30, title: "ADA & Accessibility", text: "Operator is responsible for ensuring machine placement complies with the Americans with Disabilities Act and all applicable accessibility requirements." },
    { num: 31, title: "Additional Terms", text: ag.customer_notes || "No additional terms specified." },
  ];

  for (const sec of remainingSections) {
    sectionHeader(sec.num, sec.title);
    drawWrapped(sec.text, helvetica, 8.5, gray);
  }

  /* ================================================================ */
  /*  SCHEDULE A — Equipment Details                                  */
  /* ================================================================ */
  if (includeEquipment) {
    checkPage(60);
    y -= 10;
    drawLine(y);
    y -= 20;
    drawText(page, "SCHEDULE A: EQUIPMENT DETAILS", LEFT, y, helveticaBold, 10, green);
    y -= 20;
    currentScheduleKey = "A";
    currentSectionNum = 0;

    checkPage(80);
    page.drawRectangle({ x: LEFT, y: y - 4, width: MAX_W, height: 18, color: lightBg });
    drawText(page, "Item", LEFT + 4, y, helveticaBold, 8, dark);
    drawText(page, "Model", LEFT + 140, y, helveticaBold, 8, dark);
    drawText(page, "Qty", LEFT + 310, y, helveticaBold, 8, dark);
    drawText(page, "Unit Price", LEFT + 370, y, helveticaBold, 8, dark);
    drawText(page, "Subtotal", LEFT + 450, y, helveticaBold, 8, dark);
    y -= 20;

    drawText(page, "VendEra AI Machine", LEFT + 4, y, helvetica, 8.5, dark);
    drawText(page, ag.machine_model || "—", LEFT + 140, y, helvetica, 8.5, dark);
    drawText(page, String(ag.machine_quantity || 0), LEFT + 310, y, helvetica, 8.5, dark);
    drawText(page, money(ag.machine_unit_price), LEFT + 370, y, helvetica, 8.5, dark);
    drawText(page, money(ag.equipment_subtotal), LEFT + 450, y, helveticaBold, 8.5, dark);
    y -= 16;
    drawLine(y);
    y -= 16;
    if (includeShippingStorage && Number(ag.freight_total) > 0) {
      drawText(page, "Freight", LEFT + 4, y, helvetica, 8.5, dark);
      drawText(page, `${money(ag.freight_per_machine)} x ${ag.machine_quantity || 0}`, LEFT + 310, y, helvetica, 8.5, dark);
      drawText(page, money(ag.freight_total), LEFT + 450, y, helveticaBold, 8.5, dark);
      y -= 16;
      drawLine(y);
      y -= 16;
    }
    if (ag.machine_notes) {
      y -= 4;
      drawWrapped(`Notes: ${ag.machine_notes}`, helvetica, 8, gray);
    }
    initialsPlaceholder();
  }

  /* ================================================================ */
  /*  SCHEDULE B — Location Services                                  */
  /* ================================================================ */
  if (includeLocationServices) {
    checkPage(60);
    y -= 10;
    drawLine(y);
    y -= 20;
    drawText(page, "SCHEDULE B: LOCATION SERVICES", LEFT, y, helveticaBold, 10, green);
    y -= 20;
    currentScheduleKey = "B";

    labelValue("Locations Purchased", String(ag.locations_purchased || 0));
    labelValue("Fee per Location Secured", money(ag.location_fee_per_secured));
    labelValue("Maximum Service Value", money(ag.max_location_service_value));
    labelValue("Rejection Allowance", ag.location_rejection_allowance || "Per service terms");
    labelValue("Service Timeline", ag.location_service_timeline_days ? `${ag.location_service_timeline_days} days` : "Per service terms");
    labelValue("Payment Terms", ag.location_payment_terms || "Included in total due");
    y -= 4;
    drawWrapped(
      "Location services include site identification, traffic analysis, decision-maker outreach, and lease/placement agreement facilitation. Locations that do not meet Operator's reasonable criteria may be rejected within the allowance above.",
      helvetica, 8.5, gray,
    );
    initialsPlaceholder();
  }

  /* ================================================================ */
  /*  PAYMENT SUMMARY — always shown, reflects only included sections */
  /* ================================================================ */
  checkPage(80);
  y -= 10;
  drawLine(y);
  y -= 20;
  drawText(page, "PAYMENT SUMMARY", LEFT, y, helveticaBold, 10, green);
  y -= 18;
  if (includeEquipment && Number(ag.equipment_subtotal) > 0) {
    drawText(page, `Equipment (${ag.machine_quantity || 0}x ${ag.machine_model || "VendEra AI Machine"})`, LEFT + 4, y, helvetica, 9, dark);
    const s = money(ag.equipment_subtotal);
    drawText(page, s, RIGHT - 4 - helvetica.widthOfTextAtSize(s, 9), y, helvetica, 9, dark);
    y -= 14;
  }
  const depositOnly = ag.location_services_deposit_only === true;
  const locDeposit = Math.min(Number(ag.location_services_deposit_amount) || 0, Number(ag.max_location_service_value) || 0);
  const locRemaining = depositOnly ? Math.max(0, Number(ag.max_location_service_value) - locDeposit) : 0;

  if (includeLocationServices && Number(ag.max_location_service_value) > 0) {
    const upfront = depositOnly ? locDeposit : Number(ag.max_location_service_value);
    const label = depositOnly
      ? `Location Services Deposit (${ag.locations_purchased || 0} location${(ag.locations_purchased || 0) === 1 ? "" : "s"})`
      : `Location Services (${ag.locations_purchased || 0} location${(ag.locations_purchased || 0) === 1 ? "" : "s"})`;
    drawText(page, label, LEFT + 4, y, helvetica, 9, dark);
    const s = money(upfront);
    drawText(page, s, RIGHT - 4 - helvetica.widthOfTextAtSize(s, 9), y, helvetica, 9, dark);
    y -= 14;
  }
  if (includeShippingStorage && Number(ag.freight_total) > 0) {
    drawText(page, `Shipping & Freight (${ag.machine_quantity || 0} machine${(ag.machine_quantity || 0) === 1 ? "" : "s"})`, LEFT + 4, y, helvetica, 9, dark);
    const s = money(ag.freight_total);
    drawText(page, s, RIGHT - 4 - helvetica.widthOfTextAtSize(s, 9), y, helvetica, 9, dark);
    y -= 14;
  }
  y -= 2;
  drawLine(y + 6);
  drawText(page, "TOTAL DUE PRIOR TO PROCUREMENT", LEFT + 4, y, helveticaBold, 10, dark);
  const totalStr = money(ag.total_due_prior_to_procurement);
  drawText(page, totalStr, RIGHT - 4 - helveticaBold.widthOfTextAtSize(totalStr, 12), y, helveticaBold, 12, green);
  y -= 16;

  if (includeLocationServices && depositOnly && locRemaining > 0) {
    drawText(page, `+ ${money(locRemaining)} Location Services balance due upon fulfillment of secured locations`, LEFT + 4, y, helvetica, 8, gray);
    y -= 14;
  }

  /* ================================================================ */
  /*  SCHEDULE C — Delivery & Addresses                               */
  /* ================================================================ */
  checkPage(60);
  y -= 10;
  drawLine(y);
  y -= 20;
  drawText(page, "SCHEDULE C: DELIVERY & ADDRESSES", LEFT, y, helveticaBold, 10, green);
  y -= 20;
  currentScheduleKey = "C";

  labelValue("Billing Address", ag.operator_billing_address || "—");
  labelValue("Delivery Address", ag.operator_delivery_address || "—");
  if (includeShippingStorage && ag.shipping_notes) {
    y -= 4;
    drawWrapped(`Shipping Notes: ${ag.shipping_notes}`, helvetica, 8.5, gray);
  }
  initialsPlaceholder();

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

  // Generate the signed PDF
  let pdfBytes: Uint8Array;
  if (isLocationPlacement) {
    const { generateLocationPlacementPdf } = await import("./generateLocationPlacementPdf");
    // Signed copy goes to operator + james@ + rep — never the location —
    // so include the Apex Billing addendum.
    pdfBytes = await generateLocationPlacementPdf(ag, signatures || [], initials || [], "operator");
  } else {
    pdfBytes = await generatePurchaseAgreementPdf(ag, signatures || [], initials || []);
  }
  const pdfBuffer = Buffer.from(pdfBytes);

  const companySlug = isLocationPlacement
    ? (ag.location_business_name || "location").replace(/[^a-zA-Z0-9]/g, "_")
    : (ag.operator_company_name || "operator").replace(/[^a-zA-Z0-9]/g, "_");
  const docKind = isLocationPlacement ? "Location-Placement" : "Agreement";
  const fileName = `Signed-${docKind}-${companySlug}-${agreementId.slice(0, 8)}.pdf`;
  const storagePath = `agreements/${agreementId}/${fileName}`;

  // Upload to Supabase storage
  let publicUrl = "";
  try {
    const { error: uploadErr } = await supabaseAdmin.storage
      .from("sales-documents")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });

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
  if (process.env.RESEND_API_KEY) {
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
      The VendEra AI Machine Purchase & Services Agreement between <strong>Apex AI Vending LLC</strong> and
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

  // Auto-create order + invoice for purchase agreements
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
  const includeEquipment = ag.include_equipment !== false;
  const includeLocationServices = ag.include_location_services !== false;
  const includeShippingStorage = ag.include_shipping_storage !== false;

  const items: Array<Record<string, unknown>> = [];

  if (includeEquipment && Number(ag.machine_quantity) > 0) {
    const unitPrice = Number(ag.machine_unit_price) || 0;
    const qty = Number(ag.machine_quantity) || 1;
    items.push({
      item_type: "machine_sale",
      service_name: ag.machine_model || "VendEra AI Machine",
      description: ag.machine_notes || null,
      quantity: qty,
      unit_price: unitPrice,
      price: unitPrice,
      total_price: qty * unitPrice,
      discount_percent: 0,
      status: "pending",
      deposit_required: false,
    });
  }

  if (includeLocationServices && Number(ag.locations_purchased) > 0) {
    const locFee = Number(ag.location_fee_per_secured) || 0;
    const locQty = Number(ag.locations_purchased) || 0;
    const locTotal = locQty * locFee;
    const depositOnly = ag.location_services_deposit_only === true;
    const deposit = depositOnly ? Math.min(Number(ag.location_services_deposit_amount) || 0, locTotal) : locTotal;
    const remaining = depositOnly ? Math.max(0, locTotal - deposit) : 0;

    if (depositOnly) {
      items.push({
        item_type: "location_services",
        service_name: "Location Services Deposit",
        description: `Non-refundable deposit for ${locQty} location${locQty === 1 ? "" : "s"} ($${locFee.toFixed(2)} each, $${locTotal.toFixed(2)} total). Balance of $${remaining.toFixed(2)} due on fulfillment.`,
        quantity: 1,
        unit_price: deposit,
        price: deposit,
        total_price: deposit,
        discount_percent: 0,
        status: "pending",
        deposit_required: false,
      });
      if (remaining > 0) {
        items.push({
          item_type: "location_services",
          service_name: "Location Services Remaining Balance",
          description: `Balance due after fulfillment of secured locations. Invoiced upon completion.`,
          quantity: 1,
          unit_price: remaining,
          price: remaining,
          total_price: remaining,
          discount_percent: 0,
          status: "pending_fulfillment",
          deposit_required: false,
        });
      }
    } else {
      items.push({
        item_type: "location_services",
        service_name: "Location Sourcing & Placement",
        description: `${locQty} locations at $${locFee.toFixed(2)} each. Timeline: ${ag.location_service_timeline_days || 180} days.`,
        quantity: locQty,
        unit_price: locFee,
        price: locFee,
        total_price: locTotal,
        discount_percent: 0,
        status: "pending",
        location_service_price: locTotal,
        deposit_required: false,
      });
    }
  }

  const freightTotal = Number(ag.freight_total) || 0;
  if (includeShippingStorage && freightTotal > 0) {
    items.push({
      item_type: "other",
      service_name: "Shipping & Freight",
      description: `${ag.machine_quantity || 1} machine(s) at $${(Number(ag.freight_per_machine) || 0).toFixed(2)} each`,
      quantity: 1,
      unit_price: freightTotal,
      price: freightTotal,
      total_price: freightTotal,
      discount_percent: 0,
      status: "pending",
      deposit_required: false,
    });
  }

  if (items.length === 0) return;

  // Upfront total excludes the deferred location-services balance.
  const upfrontItems = items.filter((i) => i.status !== "pending_fulfillment");
  const totalValue = upfrontItems.reduce((sum, i) => sum + (Number(i.total_price) || 0), 0);

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
      const lineItems = upfrontItems.map((item) => ({
        description: String(item.service_name || "Service"),
        amount: Number(item.unit_price) || 0,
        quantity: Number(item.quantity) || 1,
      }));

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
        const lineTotal = Number(item.total_price) || qty * unitPrice;
        return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111;">${item.service_name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:center;">${qty}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;">$${unitPrice.toFixed(2)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151;text-align:right;">$${lineTotal.toFixed(2)}</td>
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
