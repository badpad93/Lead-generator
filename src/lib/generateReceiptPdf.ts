import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { pdfSafeInline, pdfSafeMultiline } from "./pdfSafeText";

interface ReceiptItem {
  service_name: string;
  description?: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface ReceiptData {
  order_number: string | number;
  invoice_number?: string | null;
  paid_at: string;
  payment_type: "deposit" | "full";
  payment_method?: string | null;
  payment_reference?: string | null;
  amount_paid: number;
  total_value: number;
  balance_remaining: number;

  customer_name: string;
  customer_company?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;

  items: ReceiptItem[];
  notes?: string | null;
}

export async function generateReceiptPdf(data: ReceiptData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.086, 0.635, 0.294);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.07, 0.07, 0.07);
  const lightBg = rgb(0.96, 0.96, 0.96);
  const paidGreen = rgb(0.05, 0.55, 0.24);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 50;
  const RIGHT = 562;
  const MAX_W = RIGHT - LEFT;
  const BOTTOM_MARGIN = 80;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = 740;

  function drawText(p: PDFPage, text: string, x: number, yPos: number, font: PDFFont, size: number, color = dark) {
    p.drawText(pdfSafeInline(text), { x, y: yPos, size, font, color });
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
    return `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Header — green bar
  page.drawRectangle({ x: 0, y: PAGE_H - 60, width: PAGE_W, height: 60, color: green });
  drawText(page, "Apex AI Vending", LEFT, PAGE_H - 40, helveticaBold, 20, rgb(1, 1, 1));
  drawText(page, "Payment Receipt", RIGHT - helvetica.widthOfTextAtSize("Payment Receipt", 12), PAGE_H - 40, helvetica, 12, rgb(1, 1, 1));

  y = PAGE_H - 90;

  // PAID stamp
  const stampText = data.payment_type === "deposit" ? "DEPOSIT RECEIVED" : "PAID IN FULL";
  const stampWidth = helveticaBold.widthOfTextAtSize(stampText, 14) + 24;
  const stampX = RIGHT - stampWidth;
  page.drawRectangle({
    x: stampX,
    y: y - 4,
    width: stampWidth,
    height: 26,
    color: rgb(0.9, 0.98, 0.92),
    borderColor: paidGreen,
    borderWidth: 1.5,
  });
  drawText(page, stampText, stampX + 12, y + 6, helveticaBold, 12, paidGreen);

  // Left: order info
  drawText(page, `Order #: ${data.order_number}`, LEFT, y + 8, helvetica, 9, gray);
  const paidDate = new Date(data.paid_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  drawText(page, `Paid: ${paidDate}`, LEFT, y - 6, helvetica, 9, gray);
  if (data.invoice_number) {
    drawText(page, `Invoice #: ${data.invoice_number}`, LEFT + 180, y + 8, helvetica, 9, gray);
  }

  y -= 30;
  drawLine(y);
  y -= 20;

  // Customer
  drawText(page, "BILLED TO", LEFT, y, helveticaBold, 8, green);
  y -= 14;
  if (data.customer_company) {
    drawText(page, data.customer_company, LEFT, y, helveticaBold, 10, dark);
    y -= 12;
  }
  if (data.customer_name && data.customer_name !== data.customer_company) {
    drawText(page, data.customer_name, LEFT, y, helvetica, 9, dark);
    y -= 12;
  }
  if (data.customer_email) {
    drawText(page, data.customer_email, LEFT, y, helvetica, 9, gray);
    y -= 12;
  }
  if (data.customer_phone) {
    drawText(page, data.customer_phone, LEFT, y, helvetica, 9, gray);
    y -= 12;
  }
  if (data.customer_address) {
    const addrLines = wrapText(data.customer_address, helvetica, 9, 260);
    for (const line of addrLines) {
      drawText(page, line, LEFT, y, helvetica, 9, gray);
      y -= 12;
    }
  }

  y -= 8;
  drawLine(y);
  y -= 20;

  // Items table
  checkPage(30);
  page.drawRectangle({ x: LEFT, y: y - 4, width: MAX_W, height: 20, color: lightBg });
  drawText(page, "Item", LEFT + 6, y, helveticaBold, 9, dark);
  drawText(page, "Qty", LEFT + 320, y, helveticaBold, 9, dark);
  drawText(page, "Unit Price", LEFT + 370, y, helveticaBold, 9, dark);
  const totalHeader = "Amount";
  drawText(page, totalHeader, RIGHT - 6 - helveticaBold.widthOfTextAtSize(totalHeader, 9), y, helveticaBold, 9, dark);
  y -= 22;

  for (const item of data.items) {
    checkPage(20);
    const nameLines = wrapText(item.service_name, helvetica, 9, 290);
    for (let i = 0; i < nameLines.length; i++) {
      drawText(page, nameLines[i], LEFT + 6, y, helvetica, 9, dark);
      if (i === 0) {
        drawText(page, String(item.quantity), LEFT + 320, y, helvetica, 9, dark);
        drawText(page, money(item.unit_price), LEFT + 370, y, helvetica, 9, dark);
        const amt = money(item.total_price);
        drawText(page, amt, RIGHT - 6 - helvetica.widthOfTextAtSize(amt, 9), y, helvetica, 9, dark);
      }
      y -= 14;
    }
    if (item.description) {
      const descLines = wrapText(item.description, helvetica, 8, 290);
      for (const line of descLines) {
        checkPage(12);
        drawText(page, line, LEFT + 12, y, helvetica, 8, gray);
        y -= 11;
      }
    }
    drawLine(y + 4, rgb(0.94, 0.94, 0.94));
    y -= 4;
  }

  y -= 6;
  checkPage(60);
  drawLine(y);
  y -= 18;

  // Totals
  const drawRow = (label: string, value: string, bold = false, colorOverride?: [number, number, number]) => {
    const font = bold ? helveticaBold : helvetica;
    const size = bold ? 10 : 9;
    const c = colorOverride ? rgb(...colorOverride) : bold ? dark : gray;
    drawText(page, label, LEFT + 320, y, font, size, c);
    const valColor = colorOverride ? rgb(...colorOverride) : bold ? green : dark;
    drawText(page, value, RIGHT - 6 - font.widthOfTextAtSize(value, size), y, font, size, valColor);
    y -= 14;
  };

  drawRow("Order Total", money(data.total_value));
  drawRow(data.payment_type === "deposit" ? "Deposit Received" : "Amount Paid", money(data.amount_paid), true);
  if (data.balance_remaining > 0.005) {
    drawRow("Balance Remaining", money(data.balance_remaining), false, [0.7, 0.4, 0]);
  } else {
    drawRow("Balance Remaining", "$0.00", false);
  }

  y -= 6;
  drawLine(y);
  y -= 20;

  // Payment details
  drawText(page, "PAYMENT DETAILS", LEFT, y, helveticaBold, 8, green);
  y -= 14;
  drawText(page, "Method:", LEFT, y, helvetica, 9, gray);
  drawText(page, data.payment_method || "Not specified", LEFT + 60, y, helvetica, 9, dark);
  y -= 12;
  if (data.payment_reference) {
    drawText(page, "Reference:", LEFT, y, helvetica, 9, gray);
    drawText(page, data.payment_reference, LEFT + 60, y, helvetica, 9, dark);
    y -= 12;
  }
  drawText(page, "Date:", LEFT, y, helvetica, 9, gray);
  drawText(page, paidDate, LEFT + 60, y, helvetica, 9, dark);
  y -= 20;

  // Notes
  if (data.notes) {
    checkPage(30);
    drawText(page, "NOTES", LEFT, y, helveticaBold, 8, green);
    y -= 14;
    const safe = pdfSafeMultiline(data.notes);
    for (const paragraph of safe.split("\n")) {
      if (paragraph === "") {
        checkPage(14);
        y -= 6;
        continue;
      }
      const noteLines = wrapText(paragraph, helvetica, 9, MAX_W);
      for (const line of noteLines) {
        checkPage(14);
        drawText(page, line, LEFT, y, helvetica, 9, gray);
        y -= 12;
      }
    }
  }

  // Footer
  const pageCount = doc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const p = doc.getPage(i);
    drawText(p, "Apex AI Vending LLC · vendingconnector.com · james@apexaivending.com", LEFT, 30, helvetica, 7, gray);
    const numStr = `Page ${i + 1} of ${pageCount}`;
    drawText(p, numStr, RIGHT - helvetica.widthOfTextAtSize(numStr, 7), 30, helvetica, 7, gray);
  }

  return doc.save();
}
