import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

/* ------------------------------------------------------------------ */
/*  GET — Generate and return the purchase agreement as PDF           */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: ag, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !ag)
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

  // Fetch signatures and initials
  const [{ data: signatures }, { data: initials }] = await Promise.all([
    supabaseAdmin
      .from("agreement_signatures")
      .select("*")
      .eq("agreement_id", id)
      .order("signed_at", { ascending: false }),
    supabaseAdmin
      .from("agreement_initials")
      .select("*")
      .eq("agreement_id", id)
      .order("initialed_at", { ascending: true }),
  ]);

  try {
    const pdfBytes = await generatePurchaseAgreementPdf(ag, signatures || [], initials || []);
    const fileName = `Purchase-Agreement-${(ag.operator_company_name || "draft").replace(/[^a-zA-Z0-9]/g, "_")}-${id.slice(0, 8)}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `PDF generation failed: ${msg}` }, { status: 500 });
  }
}

/* ================================================================== */
/*  PDF Generation Helper                                             */
/* ================================================================== */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generatePurchaseAgreementPdf(ag: any, signatures: any[], initials: any[]): Promise<Uint8Array> {
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
    p.drawText(text, { x, y: yPos, size, font, color });
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
    const lines = wrapText(text, font, size, MAX_W - indent);
    for (const line of lines) {
      checkPage(size + 6);
      drawText(page, line, LEFT + indent, y, font, size, color);
      y -= size + 4;
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

  // Apex side
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

  // Section 1: Recitals
  sectionHeader(1, "Recitals");
  drawWrapped(
    `This VendEra AI Machine Purchase & Services Agreement ("Agreement") is entered into as of ${effectiveDate} by and between ${ag.apex_company_name || "Apex AI Vending LLC"} ("Apex" or "Company") and ${ag.operator_company_name || "[Operator]"} ("Operator"). Apex is engaged in the business of selling VendEra AI vending machines and providing related location procurement services. The Operator desires to purchase VendEra AI machines and optionally engage Apex for location services.`,
    helvetica, 8.5, gray,
  );

  // Section 2: Definitions
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

  // Section 3: Equipment Purchase
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

  // Section 4: Location Services
  sectionHeader(4, "Location Services");
  labelValue("Locations Purchased", String(ag.locations_purchased || 0));
  labelValue("Fee per Location Secured", money(ag.location_fee_per_secured));
  labelValue("Max Location Service Value", money(ag.max_location_service_value));
  labelValue("Rejection Allowance", ag.location_rejection_allowance || "Per service terms");
  labelValue("Service Timeline", ag.location_service_timeline_days ? `${ag.location_service_timeline_days} days` : "Per service terms");
  y -= 4;
  drawWrapped(
    "If Operator has elected location services, Apex will identify and secure suitable commercial locations for machine placement. Each location will meet minimum traffic and suitability criteria. Operator may reject a proposed location within the allowance specified above; additional rejections may incur supplemental fees.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  // Section 5: Shipping & Freight
  sectionHeader(5, "Shipping & Freight");
  labelValue("Freight per Machine", money(ag.freight_per_machine));
  labelValue("Freight Total", money(ag.freight_total));
  if (ag.standard_freight_rate) labelValue("Standard Rate", money(ag.standard_freight_rate));
  if (ag.discounted_freight_rate) labelValue("Discounted Rate", money(ag.discounted_freight_rate));
  if (ag.storage_fee_per_machine_month) labelValue("Storage Fee/Month", money(ag.storage_fee_per_machine_month));
  if (ag.free_storage_months) labelValue("Free Storage Months", String(ag.free_storage_months));
  y -= 4;
  drawWrapped(
    "Freight charges cover shipping from the distribution center to the Operator's designated delivery address. Machines are shipped via common carrier. Risk of loss transfers to Operator upon delivery. Storage fees apply if Operator is unable to accept delivery within the free storage period.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  // Section 6: Payment Terms
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

  // Section 7: Delivery & Installation
  sectionHeader(7, "Delivery & Installation");
  drawWrapped(
    "Apex will coordinate delivery to the Operator's specified address. Standard delivery timeframe is 4-8 weeks from payment confirmation, subject to manufacturer availability. Operator is responsible for ensuring adequate site preparation including electrical access (standard 120V outlet), sufficient floor space, and ADA-compliant placement. Apex may offer optional installation services at additional cost.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  // Section 8: Warranties & Representations
  sectionHeader(8, "Warranties & Representations");
  drawWrapped(
    "Apex warrants that: (a) all machines are new and conform to published specifications; (b) machines will be free from material defects for 12 months from delivery; (c) Apex has authority to sell the machines; (d) location services will be performed with reasonable care and diligence. THE FOREGOING WARRANTIES ARE EXCLUSIVE AND IN LIEU OF ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.",
    helvetica, 8.5, gray,
  );
  initialsPlaceholder();

  // Sections 9-31 — condensed legal provisions
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
  checkPage(60);
  y -= 10;
  drawLine(y);
  y -= 20;
  drawText(page, "SCHEDULE A: EQUIPMENT DETAILS", LEFT, y, helveticaBold, 10, green);
  y -= 20;
  currentScheduleKey = "A";
  currentSectionNum = 0;

  // Table header background
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
  drawText(page, "Freight", LEFT + 4, y, helvetica, 8.5, dark);
  drawText(page, `${money(ag.freight_per_machine)} x ${ag.machine_quantity || 0}`, LEFT + 310, y, helvetica, 8.5, dark);
  drawText(page, money(ag.freight_total), LEFT + 450, y, helveticaBold, 8.5, dark);
  y -= 16;
  drawLine(y);
  y -= 16;
  drawText(page, "TOTAL DUE PRIOR TO PROCUREMENT", LEFT + 4, y, helveticaBold, 9, dark);
  drawText(page, money(ag.total_due_prior_to_procurement), LEFT + 450, y, helveticaBold, 10, green);
  y -= 10;
  if (ag.machine_notes) {
    y -= 10;
    drawWrapped(`Notes: ${ag.machine_notes}`, helvetica, 8, gray);
  }
  initialsPlaceholder();

  /* ================================================================ */
  /*  SCHEDULE B — Location Services                                  */
  /* ================================================================ */
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
  if (ag.shipping_notes) {
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

  // Look up actual signatures
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
