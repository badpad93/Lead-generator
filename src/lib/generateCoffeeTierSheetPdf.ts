import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { pdfSafeInline } from "./pdfSafeText";

/**
 * A printable coffee pricing sheet for one pricing tier — product name, SKU,
 * unit price, and shipping for the selected tier. Rendered with pdf-lib to
 * match the other branded PDFs in the app.
 */

export interface TierSheetItem {
  name: string;
  sku: string | null;
  price: number;
  shipping: number;
}

export interface TierSheetInput {
  tierName: string;
  generatedAt: Date;
  items: TierSheetItem[];
}

const money = (n: number) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;

export async function generateCoffeeTierSheetPdf(input: TierSheetInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.086, 0.635, 0.294);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.07, 0.07, 0.07);
  const headerBg = rgb(0.95, 0.97, 0.95);

  const PAGE_W = 612, PAGE_H = 792, LEFT = 50, RIGHT = 562, BOTTOM = 60;
  // Columns: Product | SKU | Unit price | Shipping
  const COL_SKU = 320, COL_PRICE = 430, COL_SHIP = 505;

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = 740;

  type Cell = { text: string; x: number; y: number; font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> };
  const draw = (o: Cell) =>
    page.drawText(pdfSafeInline(o.text), { x: o.x, y: o.y, size: o.size ?? 10, font: o.font ?? font, color: o.color ?? dark });

  // Header
  draw({ text: "Coffee Pricing Sheet", x: LEFT, y, font: bold, size: 20 });
  y -= 22;
  draw({ text: `Tier: ${input.tierName}`, x: LEFT, y, font: bold, size: 12, color: green });
  draw({ text: input.generatedAt.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }), x: RIGHT - 160, y, size: 10, color: gray });
  y -= 10;
  page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 1, color: green });
  y -= 24;

  function tableHeader() {
    page.drawRectangle({ x: LEFT - 6, y: y - 6, width: RIGHT - LEFT + 12, height: 22, color: headerBg });
    draw({ text: "PRODUCT", x: LEFT, y, font: bold, size: 9, color: gray });
    draw({ text: "SKU", x: COL_SKU, y, font: bold, size: 9, color: gray });
    draw({ text: "UNIT PRICE", x: COL_PRICE, y, font: bold, size: 9, color: gray });
    draw({ text: "SHIPPING", x: COL_SHIP, y, font: bold, size: 9, color: gray });
    y -= 24;
  }

  tableHeader();

  for (const item of input.items) {
    if (y < BOTTOM) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = 740;
      tableHeader();
    }
    draw({ text: truncate(item.name, font, 10, COL_SKU - LEFT - 8), x: LEFT, y, size: 10 });
    draw({ text: item.sku || "—", x: COL_SKU, y, size: 10, color: gray });
    draw({ text: money(item.price), x: COL_PRICE, y, font: bold, size: 10 });
    draw({ text: item.shipping > 0 ? money(item.shipping) : "—", x: COL_SHIP, y, size: 10, color: gray });
    y -= 18;
    page.drawLine({ start: { x: LEFT, y: y + 6 }, end: { x: RIGHT, y: y + 6 }, thickness: 0.3, color: rgb(0.9, 0.9, 0.9) });
  }

  if (input.items.length === 0) {
    draw({ text: "No active coffee products.", x: LEFT, y, size: 10, color: gray });
  }

  // Footer note
  const footerY = 40;
  page.drawLine({ start: { x: LEFT, y: footerY + 14 }, end: { x: RIGHT, y: footerY + 14 }, thickness: 0.5, color: rgb(0.85, 0.85, 0.85) });
  draw({ text: `Prices reflect the ${input.tierName} tier and are subject to change. Vending Connector.`, x: LEFT, y: footerY, size: 8, color: gray });

  return doc.save();
}

/** Trim a single line to fit a max width, adding an ellipsis. */
function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = pdfSafeInline(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let out = safe;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}
