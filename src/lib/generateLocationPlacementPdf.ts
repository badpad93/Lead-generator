import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

/* ================================================================== */
/*  PDF Generation — Location Placement Agreement                     */
/* ================================================================== */

export type LocationPlacementAudience = "operator" | "location";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateLocationPlacementPdf(ag: any, signatures: any[], initials: any[], audience: LocationPlacementAudience = "operator"): Promise<Uint8Array> {
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
  let currentSectionNum = 0;
  let currentScheduleKey: string | null = null;

  function newPage() {
    drawText(page, "Apex AI Vending — Location Placement Agreement", LEFT, 30, helvetica, 7, gray);
    const pageNum = doc.getPageCount();
    const numStr = `Page ${pageNum}`;
    drawText(page, numStr, RIGHT - helvetica.widthOfTextAtSize(numStr, 7), 30, helvetica, 7, gray);
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = 740;
  }

  function checkPage(needed: number) {
    if (y - needed < BOTTOM_MARGIN) newPage();
  }

  function drawText(p: PDFPage, text: string, x: number, yPos: number, font: PDFFont, size: number, color = dark) {
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

  function drawWrapped(text: string, font: PDFFont, size: number, color = dark, indent = 0) {
    const lines = wrapText(text, font, size, MAX_W - indent);
    for (const line of lines) {
      checkPage(size + 4);
      drawText(page, line, LEFT + indent, y, font, size, color);
      y -= size + 4;
    }
  }

  function sectionHeader(num: number, title: string) {
    checkPage(40);
    y -= 8;
    currentSectionNum = num;
    drawText(page, `Section ${num} — ${title}`, LEFT, y, helveticaBold, 11, green);
    y -= 6;
    drawLine(y);
    y -= 14;
  }

  function labelValue(label: string, value: string) {
    checkPage(20);
    drawText(page, label, LEFT, y, helveticaBold, 9, dark);
    const labelWidth = helveticaBold.widthOfTextAtSize(label, 9);
    drawText(page, value, LEFT + labelWidth + 8, y, helvetica, 9, gray);
    y -= 14;
  }

  function initialsPlaceholder() {
    const sectionKey: string = currentScheduleKey
      ? `schedule_${currentScheduleKey.toLowerCase()}`
      : `section_${currentSectionNum}`;

    const operatorInitial = initials?.find((i) => i.signer_type === "operator" && i.section_key === sectionKey);
    const apexInitial = initials?.find((i) => i.signer_type === "apex" && i.section_key === sectionKey);

    y -= 4;
    checkPage(16);
    const text = "Initials:";
    drawText(page, text, LEFT, y, helvetica, 8, gray);
    const opBox = LEFT + 50;
    page.drawRectangle({ x: opBox, y: y - 2, width: 40, height: 14, color: lightBg });
    if (operatorInitial?.initial_text) {
      drawText(page, operatorInitial.initial_text, opBox + 4, y + 1, helveticaBold, 9, dark);
    }
    drawText(page, "Location", opBox + 44, y, helvetica, 7, gray);

    const apxBox = LEFT + 130;
    page.drawRectangle({ x: apxBox, y: y - 2, width: 40, height: 14, color: lightBg });
    if (apexInitial?.initial_text) {
      drawText(page, apexInitial.initial_text, apxBox + 4, y + 1, helveticaBold, 9, dark);
    }
    drawText(page, "Operator", apxBox + 44, y, helvetica, 7, gray);
    y -= 18;
  }

  function money(n: number | null | undefined): string {
    const v = Number(n) || 0;
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /* ================================================================ */
  /*  Header                                                          */
  /* ================================================================ */
  page.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: green });
  drawText(page, "Apex AI Vending", LEFT, PAGE_H - 35, helveticaBold, 18, rgb(1, 1, 1));
  drawText(page, "Location Placement Agreement", LEFT, PAGE_H - 50, helvetica, 10, rgb(0.9, 1, 0.9));
  y = PAGE_H - 90;

  drawText(page, `Effective Date: ${ag.effective_date || "—"}`, LEFT, y, helvetica, 9, gray);
  y -= 14;
  drawText(page, `Agreement #: ${(ag.id || "").slice(0, 8).toUpperCase()}`, LEFT, y, helvetica, 9, gray);
  y -= 20;

  drawLine(y);
  y -= 20;

  /* ================================================================ */
  /*  Parties                                                         */
  /* ================================================================ */
  drawText(page, "PARTIES", LEFT, y, helveticaBold, 10, green);
  y -= 16;

  drawText(page, "OPERATOR (the vending company placing the machine)", LEFT, y, helveticaBold, 8, dark);
  y -= 12;
  labelValue("Company:", ag.placement_operator_company || "—");
  labelValue("Contact:", ag.placement_operator_contact || "—");
  labelValue("Email:", ag.placement_operator_email || "—");
  labelValue("Phone:", ag.placement_operator_phone || "—");
  y -= 6;

  drawText(page, "LOCATION (the host)", LEFT, y, helveticaBold, 8, dark);
  y -= 12;
  labelValue("Business:", ag.location_business_name || "—");
  labelValue("Contact:", ag.location_contact_name || "—");
  if (ag.location_contact_title) labelValue("Title / Role:", ag.location_contact_title);
  labelValue("Email:", ag.location_contact_email || "—");
  labelValue("Phone:", ag.location_contact_phone || "—");
  if (ag.location_address) {
    const addr = [ag.location_address, [ag.location_city, ag.location_state].filter(Boolean).join(", "), ag.location_zip].filter(Boolean).join(", ");
    labelValue("Address:", addr);
  }
  y -= 4;
  drawLine(y);
  y -= 10;

  /* ================================================================ */
  /*  Section 1 — Recitals                                            */
  /* ================================================================ */
  sectionHeader(1, "Recitals");
  drawWrapped(
    "WHEREAS, Operator is in the business of operating smart vending machines and desires to place such machines at the Location;",
    helvetica, 9, gray
  );
  y -= 2;
  drawWrapped(
    "WHEREAS, the Location desires to host vending machines on its premises subject to the terms set forth herein;",
    helvetica, 9, gray
  );
  y -= 2;
  drawWrapped(
    "NOW, THEREFORE, in consideration of the mutual covenants and agreements set forth herein, the parties agree as follows:",
    helvetica, 9, gray
  );

  /* ================================================================ */
  /*  Section 2 — Placement Terms                                     */
  /* ================================================================ */
  if (ag.include_placement_terms !== false) {
    sectionHeader(2, "Placement Terms");
    labelValue("Machine Count:", String(ag.placement_machine_count || 0));
    labelValue("Machine Type:", ag.placement_machine_type || "VendEra AI Machine");
    if (ag.placement_installation_date) labelValue("Target Installation:", String(ag.placement_installation_date));
    labelValue("Term Length:", `${ag.placement_term_months || 0} months`);
    labelValue("Exclusive Placement:", ag.placement_exclusivity ? "Yes" : "No");
    y -= 4;
    drawWrapped(
      `Operator agrees to install ${ag.placement_machine_count || 0} ${ag.placement_machine_type || "vending machine"}(s) at the Location for a term of ${ag.placement_term_months || 0} months commencing on the Effective Date or installation date, whichever is later.`,
      helvetica, 9, gray
    );
    if (ag.placement_exclusivity) {
      y -= 2;
      drawWrapped(
        "Location agrees that during the Term, Operator's machines shall be the exclusive vending equipment installed at the premises; Location shall not enter into any agreement with a competing vending operator covering the same premises.",
        helvetica, 9, gray
      );
    }
    if (ag.placement_notes) {
      y -= 2;
      drawWrapped(`Additional Terms: ${ag.placement_notes}`, helvetica, 9, gray);
    }
    initialsPlaceholder();
  }

  /* ================================================================ */
  /*  Section 3 — Compensation                                        */
  /* ================================================================ */
  if (ag.include_compensation !== false) {
    sectionHeader(3, "Compensation");
    const ctype = ag.commission_type || "revenue_share";
    if (ctype === "revenue_share") {
      labelValue("Compensation Type:", "Revenue Share");
      labelValue("Revenue Share %:", `${Number(ag.commission_pct || 0).toFixed(1)}%`);
      labelValue("Payout Schedule:", ag.commission_payout_schedule || "monthly");
      y -= 4;
      drawWrapped(
        `Location shall receive ${Number(ag.commission_pct || 0).toFixed(1)}% of net revenue from machine sales, payable ${ag.commission_payout_schedule || "monthly"}. Net revenue is calculated as gross sales less applicable taxes and processing fees.`,
        helvetica, 9, gray
      );
    } else if (ctype === "flat_monthly") {
      labelValue("Compensation Type:", "Flat Monthly Payment");
      labelValue("Monthly Payment:", money(ag.commission_monthly_fee));
      labelValue("Payout Schedule:", ag.commission_payout_schedule || "monthly");
      y -= 4;
      drawWrapped(
        `Operator shall pay Location ${money(ag.commission_monthly_fee)} per month for the duration of the Term, payable ${ag.commission_payout_schedule || "monthly"}.`,
        helvetica, 9, gray
      );
    } else {
      labelValue("Compensation Type:", "No Compensation");
      y -= 4;
      drawWrapped(
        "No monetary compensation is provided to Location under this agreement. Location agrees to host the machines as a courtesy to its employees, members, and/or visitors.",
        helvetica, 9, gray
      );
    }
    if (ag.commission_notes) {
      y -= 2;
      drawWrapped(`Notes: ${ag.commission_notes}`, helvetica, 9, gray);
    }
    initialsPlaceholder();
  }

  /* ================================================================ */
  /*  Section 4 — Duration & Termination                              */
  /* ================================================================ */
  if (ag.include_duration_termination !== false) {
    sectionHeader(4, "Duration & Termination");
    drawWrapped(
      `This Agreement shall remain in effect for ${ag.placement_term_months || 24} months from the Effective Date (or installation date, whichever is later). Either party may terminate this Agreement for cause upon 30 days' written notice if the other party materially breaches any provision and fails to cure such breach within the notice period.`,
      helvetica, 9, gray
    );
    y -= 2;
    drawWrapped(
      "Upon termination, Operator shall remove all machines and equipment from the premises within thirty (30) days. Location agrees to provide reasonable access during normal business hours for such removal.",
      helvetica, 9, gray
    );
    initialsPlaceholder();
  }

  /* ================================================================ */
  /*  Section 5 — Responsibilities                                    */
  /* ================================================================ */
  if (ag.include_responsibilities !== false) {
    sectionHeader(5, "Responsibilities");
    drawText(page, "OPERATOR shall:", LEFT, y, helveticaBold, 9, dark);
    y -= 12;
    drawWrapped("• Install, service, restock, and maintain the machines at its own expense.", helvetica, 9, gray, 8);
    drawWrapped("• Carry general commercial liability insurance covering machine operation.", helvetica, 9, gray, 8);
    drawWrapped("• Pay all applicable taxes on revenue and provide accurate payout reports.", helvetica, 9, gray, 8);
    drawWrapped("• Promptly respond to service requests and keep the machines stocked.", helvetica, 9, gray, 8);
    y -= 4;
    drawText(page, "LOCATION shall:", LEFT, y, helveticaBold, 9, dark);
    y -= 12;
    drawWrapped("• Provide a suitable, accessible location for the machines with a standard 120V electrical outlet.", helvetica, 9, gray, 8);
    drawWrapped("• Allow reasonable access for installation, service, restocking, and removal during business hours.", helvetica, 9, gray, 8);
    drawWrapped("• Notify Operator promptly of any service issues or damage to the machines.", helvetica, 9, gray, 8);
    drawWrapped("• Refrain from operating, modifying, or relocating the machines without Operator's consent.", helvetica, 9, gray, 8);
    initialsPlaceholder();
  }

  /* ================================================================ */
  /*  Standard provisions                                             */
  /* ================================================================ */
  sectionHeader(6, "Ownership & Liability");
  drawWrapped(
    "Title to the machines and equipment remains with Operator at all times. Operator bears the risk of loss for the machines. Location is not liable for normal wear and tear or for losses arising from third-party theft or vandalism unless caused by Location's gross negligence.",
    helvetica, 9, gray
  );

  sectionHeader(7, "Confidentiality");
  drawWrapped(
    "Each party agrees to keep confidential all non-public business information disclosed by the other party in connection with this Agreement, including pricing, revenue figures, and customer data.",
    helvetica, 9, gray
  );

  sectionHeader(8, "Independent Contractors");
  drawWrapped(
    "The parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, or employer-employee relationship.",
    helvetica, 9, gray
  );

  sectionHeader(9, "Governing Law");
  drawWrapped(
    `This Agreement is governed by the laws of the State of ${ag.governing_state || "Texas"}, without regard to its conflict-of-laws principles.`,
    helvetica, 9, gray
  );

  sectionHeader(10, "Entire Agreement");
  drawWrapped(
    "This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements regarding its subject matter. Amendments must be in writing and signed by both parties.",
    helvetica, 9, gray
  );

  /* ================================================================ */
  /*  Operator-only billing addendum (never shown to the location)    */
  /* ================================================================ */
  if (audience === "operator" && Number(ag.apex_placement_fee) > 0) {
    checkPage(80);
    y -= 16;
    drawLine(y);
    y -= 22;
    drawText(page, "SCHEDULE A — APEX BILLING (OPERATOR COPY ONLY)", LEFT, y, helveticaBold, 10, green);
    y -= 18;
    drawWrapped(
      "This schedule is included only on the operator's executed copy of the Agreement and is not part of the Location's copy. It memorializes the placement fee owed by the Operator to Apex AI Vending for sourcing and securing this Location.",
      helvetica, 9, gray
    );
    y -= 6;
    labelValue("Apex Placement Fee:", money(ag.apex_placement_fee));
    labelValue("Payable To:", "Apex AI Vending LLC");
    if (ag.apex_placement_fee_notes) {
      y -= 2;
      drawWrapped(`Notes: ${ag.apex_placement_fee_notes}`, helvetica, 9, gray);
    }
    y -= 4;
    drawWrapped(
      "The Apex Placement Fee is due upon execution of this Agreement unless otherwise stated above. Apex AI Vending will invoice the Operator separately.",
      helvetica, 9, gray
    );
  }

  /* ================================================================ */
  /*  Signature blocks                                                */
  /* ================================================================ */
  checkPage(180);
  y -= 12;
  drawLine(y);
  y -= 24;
  drawText(page, "SIGNATURES", LEFT, y, helveticaBold, 12, green);
  y -= 22;

  const locSig = signatures?.find((s) => s.signer_type === "operator"); // location is the first signer in our flow
  const opSig = signatures?.find((s) => s.signer_type === "apex"); // operator countersigns

  // Location signature
  drawText(page, "LOCATION", LEFT, y, helveticaBold, 10, dark);
  y -= 16;
  page.drawRectangle({ x: LEFT, y: y - 30, width: 220, height: 40, color: lightBg });
  if (locSig?.signature_data) {
    drawText(page, locSig.signer_name || "—", LEFT + 6, y - 14, helveticaBold, 11, dark);
    drawText(page, `Signed: ${locSig.signed_at ? new Date(locSig.signed_at).toLocaleDateString() : "—"}`, LEFT + 6, y - 26, helvetica, 8, gray);
  }
  drawText(page, "Signature", LEFT, y - 42, helvetica, 7, gray);
  labelValue("Name:", locSig?.signer_name || "—");
  labelValue("Title:", locSig?.signer_title || ag.location_contact_title || "—");
  labelValue("Business:", ag.location_business_name || "—");
  labelValue("Email:", ag.location_contact_email || "—");
  if (locSig?.signed_at) labelValue("Date:", new Date(locSig.signed_at).toLocaleString());
  if (locSig?.signature_ip) labelValue("IP Address:", locSig.signature_ip);

  y -= 12;
  drawLine(y);
  y -= 22;

  // Operator signature
  drawText(page, "OPERATOR", LEFT, y, helveticaBold, 10, dark);
  y -= 16;
  page.drawRectangle({ x: LEFT, y: y - 30, width: 220, height: 40, color: lightBg });
  if (opSig?.signature_data) {
    drawText(page, opSig.signer_name || "—", LEFT + 6, y - 14, helveticaBold, 11, dark);
    drawText(page, `Signed: ${opSig.signed_at ? new Date(opSig.signed_at).toLocaleDateString() : "—"}`, LEFT + 6, y - 26, helvetica, 8, gray);
  }
  drawText(page, "Signature", LEFT, y - 42, helvetica, 7, gray);
  y -= 60;
  labelValue("Name:", opSig?.signer_name || ag.placement_operator_contact || "—");
  labelValue("Company:", ag.placement_operator_company || "—");
  labelValue("Email:", ag.placement_operator_email || "—");
  if (opSig?.signed_at) labelValue("Date:", new Date(opSig.signed_at).toLocaleString());

  // Page footers
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    drawText(p, "Apex AI Vending — Location Placement Agreement", LEFT, 30, helvetica, 7, gray);
    const numStr = `Page ${i + 1} of ${pageCount}`;
    drawText(p, numStr, RIGHT - helvetica.widthOfTextAtSize(numStr, 7), 30, helvetica, 7, gray);
  }

  return doc.save();
}
