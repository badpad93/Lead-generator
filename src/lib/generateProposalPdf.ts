import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

interface ProposalData {
  proposal_number: string;
  company_name: string | null;
  company_email: string | null;
  company_phone: string | null;
  company_website: string | null;
  company_address: string | null;
  company_city: string | null;
  company_state: string | null;
  company_zip: string | null;
  client_name: string | null;
  client_company: string | null;
  client_email: string | null;
  client_phone: string | null;
  total_retail: number;
  notes: string | null;
  valid_until: string | null;
  created_at: string;
}

interface ProposalItem {
  product_name: string;
  category: string | null;
  unit: string;
  retail_price: number;
  quantity: number;
  retail_subtotal: number;
  sort_order: number;
}

export async function generateProposalPdf(proposal: ProposalData, items: ProposalItem[]): Promise<Uint8Array> {
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

  function drawText(p: PDFPage, text: string, x: number, yPos: number, font: PDFFont, size: number, color = dark) {
    p.drawText(text, { x, y: yPos, size, font, color });
  }

  function drawLine(yPos: number, color = rgb(0.85, 0.85, 0.85)) {
    page.drawLine({ start: { x: LEFT, y: yPos }, end: { x: RIGHT, y: yPos }, thickness: 0.5, color });
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

  function checkPage(needed: number) {
    if (y - needed < BOTTOM_MARGIN) {
      const pageNum = doc.getPageCount();
      drawText(page, `Page ${pageNum}`, RIGHT - helvetica.widthOfTextAtSize(`Page ${pageNum}`, 7), 30, helvetica, 7, gray);
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = 740;
    }
  }

  function money(n: number): string {
    return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const companyName = proposal.company_name || "Your Vending Partner";

  // Header — green bar
  page.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: green });
  drawText(page, companyName, LEFT, PAGE_H - 40, helveticaBold, 20, rgb(1, 1, 1));
  drawText(page, "Coffee Service Proposal", RIGHT - helvetica.widthOfTextAtSize("Coffee Service Proposal", 10), PAGE_H - 40, helvetica, 10, rgb(1, 1, 1));

  y = PAGE_H - 90;

  // Proposal info row
  drawText(page, `Proposal #: ${proposal.proposal_number}`, LEFT, y, helvetica, 9, gray);
  const dateStr = new Date(proposal.created_at).toLocaleDateString();
  drawText(page, `Date: ${dateStr}`, LEFT + 200, y, helvetica, 9, gray);
  if (proposal.valid_until) {
    const expiry = new Date(proposal.valid_until).toLocaleDateString();
    drawText(page, `Valid Until: ${expiry}`, LEFT + 370, y, helvetica, 9, gray);
  }
  y -= 24;
  drawLine(y);
  y -= 20;

  // Two-column: Prepared By / Prepared For
  drawText(page, "PREPARED BY", LEFT, y, helveticaBold, 8, green);
  drawText(page, "PREPARED FOR", LEFT + MAX_W / 2 + 10, y, helveticaBold, 8, green);
  y -= 16;

  const leftCol = [
    companyName,
    proposal.company_email,
    proposal.company_phone,
    [proposal.company_address, [proposal.company_city, proposal.company_state].filter(Boolean).join(", "), proposal.company_zip].filter(Boolean).join(", ") || null,
    proposal.company_website,
  ].filter(Boolean) as string[];

  const rightCol = [
    proposal.client_company || proposal.client_name,
    proposal.client_name && proposal.client_company ? proposal.client_name : null,
    proposal.client_email,
    proposal.client_phone,
  ].filter(Boolean) as string[];

  const maxRows = Math.max(leftCol.length, rightCol.length);
  for (let i = 0; i < maxRows; i++) {
    if (leftCol[i]) drawText(page, leftCol[i], LEFT, y, helvetica, 9, dark);
    if (rightCol[i]) drawText(page, rightCol[i], LEFT + MAX_W / 2 + 10, y, helvetica, 9, dark);
    y -= 14;
  }

  y -= 10;
  drawLine(y);
  y -= 24;

  // Items table header
  checkPage(30);
  page.drawRectangle({ x: LEFT, y: y - 4, width: MAX_W, height: 20, color: lightBg });
  drawText(page, "Product", LEFT + 6, y, helveticaBold, 9, dark);
  drawText(page, "Qty", LEFT + 300, y, helveticaBold, 9, dark);
  drawText(page, "Unit Price", LEFT + 360, y, helveticaBold, 9, dark);
  const totalHeader = "Total";
  drawText(page, totalHeader, RIGHT - 6 - helveticaBold.widthOfTextAtSize(totalHeader, 9), y, helveticaBold, 9, dark);
  y -= 22;

  const sortedItems = [...items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  let currentCategory = "";

  for (const item of sortedItems) {
    if (item.category && item.category !== currentCategory) {
      checkPage(30);
      currentCategory = item.category;
      drawText(page, currentCategory, LEFT + 6, y, helveticaBold, 8, green);
      y -= 16;
    }

    checkPage(20);
    const nameLines = wrapText(item.product_name, helvetica, 9, 280);
    for (let i = 0; i < nameLines.length; i++) {
      drawText(page, nameLines[i], LEFT + 6, y, helvetica, 9, dark);
      if (i === 0) {
        drawText(page, String(item.quantity), LEFT + 310, y, helvetica, 9, dark);
        const upStr = money(item.retail_price);
        drawText(page, upStr, LEFT + 360, y, helvetica, 9, dark);
        const ltStr = money(item.retail_subtotal);
        drawText(page, ltStr, RIGHT - 6 - helvetica.widthOfTextAtSize(ltStr, 9), y, helvetica, 9, dark);
      }
      y -= 14;
    }

    drawLine(y + 6, rgb(0.92, 0.92, 0.92));
  }

  y -= 10;
  checkPage(40);
  drawLine(y);
  y -= 20;

  // Total
  drawText(page, "TOTAL", LEFT + 360, y, helveticaBold, 11, dark);
  const totalStr = money(proposal.total_retail);
  drawText(page, totalStr, RIGHT - 6 - helveticaBold.widthOfTextAtSize(totalStr, 14), y, helveticaBold, 14, green);
  y -= 30;

  // Notes
  if (proposal.notes) {
    checkPage(60);
    drawLine(y);
    y -= 20;
    drawText(page, "NOTES", LEFT, y, helveticaBold, 8, green);
    y -= 16;
    const noteLines = wrapText(proposal.notes, helvetica, 9, MAX_W);
    for (const line of noteLines) {
      checkPage(14);
      drawText(page, line, LEFT, y, helvetica, 9, gray);
      y -= 14;
    }
  }

  // Footer
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    const footerText = `${companyName} — Proposal ${proposal.proposal_number}`;
    drawText(p, footerText, LEFT, 30, helvetica, 7, gray);
    const numStr = `Page ${i + 1} of ${pageCount}`;
    drawText(p, numStr, RIGHT - helvetica.widthOfTextAtSize(numStr, 7), 30, helvetica, 7, gray);
  }

  return doc.save();
}
