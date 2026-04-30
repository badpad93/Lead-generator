import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";
import { PricingResult } from "@/lib/pricing/locationPricing";

export interface AgreementPdfData {
  businessName: string;
  contactName: string;
  industry: string;
  zip: string;
  pricing: PricingResult;
  agreementUrl: string;
  generatedAt: string;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.07, 0.07, 0.07)
) {
  page.drawText(text, { x, y, size, font, color });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y1 },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
}

export async function generateAgreementPdf(data: AgreementPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.086, 0.635, 0.294);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.07, 0.07, 0.07);

  let y = 740;
  const left = 50;
  const right = 562;

  // Header
  drawText(page, "VENDING CONNECTOR", left, y, helveticaBold, 18, green);
  y -= 14;
  drawText(page, "Location Placement Agreement", left, y, helvetica, 10, gray);

  // Date
  drawText(page, data.generatedAt, right - helvetica.widthOfTextAtSize(data.generatedAt, 9), y + 14, helvetica, 9, gray);

  y -= 30;
  drawLine(page, left, y, right);

  // Prepared for
  y -= 25;
  drawText(page, "PREPARED FOR", left, y, helveticaBold, 8, gray);
  y -= 16;
  drawText(page, data.businessName, left, y, helveticaBold, 14, dark);
  y -= 16;
  drawText(page, data.contactName, left, y, helvetica, 10, gray);

  y -= 35;
  drawLine(page, left, y, right);

  // Location summary
  y -= 25;
  drawText(page, "LOCATION SUMMARY", left, y, helveticaBold, 8, gray);

  y -= 22;
  const col2 = 300;
  drawText(page, "Industry", left, y, helvetica, 9, gray);
  drawText(page, data.industry || "—", left + 100, y, helveticaBold, 10, dark);
  drawText(page, "Zip Code", col2, y, helvetica, 9, gray);
  drawText(page, data.zip || "—", col2 + 100, y, helveticaBold, 10, dark);

  y -= 35;
  drawLine(page, left, y, right);

  // Scoring breakdown
  y -= 25;
  drawText(page, "PLACEMENT SCORE BREAKDOWN", left, y, helveticaBold, 8, gray);

  y -= 22;
  const scoreRows = [
    { label: "Traffic Score", value: data.pricing.traffic_score, max: 70 },
    { label: "Business Hours Score", value: data.pricing.hours_score, max: 20 },
    { label: "Machine Demand Score", value: data.pricing.machine_score, max: 10 },
  ];

  for (const row of scoreRows) {
    drawText(page, row.label, left, y, helvetica, 10, dark);
    const scoreStr = `${Math.round(row.value)} / ${row.max}`;
    drawText(page, scoreStr, right - helvetica.widthOfTextAtSize(scoreStr, 10), y, helveticaBold, 10, dark);

    // Progress bar
    y -= 12;
    const barWidth = right - left;
    const fillWidth = (row.value / row.max) * barWidth;
    page.drawRectangle({ x: left, y: y - 2, width: barWidth, height: 6, color: rgb(0.93, 0.93, 0.93) });
    page.drawRectangle({ x: left, y: y - 2, width: Math.max(fillWidth, 0), height: 6, color: green });
    y -= 20;
  }

  // Total score
  y -= 5;
  drawLine(page, left, y, right);
  y -= 20;
  drawText(page, "TOTAL PLACEMENT SCORE", left, y, helveticaBold, 10, dark);
  const totalStr = `${data.pricing.total_score} / 100`;
  drawText(page, totalStr, right - helveticaBold.widthOfTextAtSize(totalStr, 14), y, helveticaBold, 14, green);

  y -= 15;
  drawText(page, data.pricing.tier_label, left, y, helvetica, 9, gray);

  y -= 35;
  drawLine(page, left, y, right);

  // Pricing
  y -= 30;
  drawText(page, "PLACEMENT FEE", left, y, helveticaBold, 8, gray);
  y -= 25;
  const priceStr = `$${data.pricing.price.toLocaleString()}`;
  drawText(page, priceStr, left, y, helveticaBold, 28, green);
  y -= 16;
  drawText(page, "One-time location placement fee", left, y, helvetica, 9, gray);

  y -= 40;
  drawLine(page, left, y, right);

  // Terms
  y -= 20;
  drawText(page, "TERMS", left, y, helveticaBold, 8, gray);
  y -= 16;
  const terms = [
    "By signing and completing payment, you agree to the following:",
    "• This fee covers the exclusive placement of vending machines at the specified location.",
    "• Full site details (address, decision maker contact, etc.) will be provided after payment.",
    "• Placement is subject to final verification of site details.",
  ];
  for (const line of terms) {
    drawText(page, line, left, y, helvetica, 9, gray);
    y -= 14;
  }

  // Sign & Pay CTA
  y -= 25;
  page.drawRectangle({
    x: left,
    y: y - 12,
    width: right - left,
    height: 40,
    color: rgb(0.95, 0.99, 0.96),
    borderColor: green,
    borderWidth: 1,
  });
  drawText(page, "To sign and pay, visit:", left + 15, y + 6, helvetica, 10, dark);
  drawText(page, data.agreementUrl, left + 15, y - 8, helveticaBold, 9, green);

  // Footer
  drawText(page, "Vending Connector — vendingconnector.com", left, 30, helvetica, 8, gray);

  return doc.save();
}

export async function generateSiteDetailsPdf(data: {
  businessName: string;
  contactName: string;
  locationName: string;
  address: string;
  phone: string;
  decisionMakerName: string;
  decisionMakerEmail: string;
  industry: string;
  zip: string;
  employeeCount: number;
  trafficCount: number;
  machineType: string;
  machinesRequested: number;
  businessHours: string;
  pricing: PricingResult;
  generatedAt: string;
  locationAgreement?: {
    signatureName: string;
    signedAt: string;
    contactName: string;
    titleRole?: string;
    email: string;
    phone: string;
  };
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.086, 0.635, 0.294);
  const gray = rgb(0.42, 0.42, 0.42);
  const dark = rgb(0.07, 0.07, 0.07);

  let y = 740;
  const left = 50;
  const right = 562;

  drawText(page, "VENDING CONNECTOR", left, y, helveticaBold, 18, green);
  y -= 14;
  drawText(page, "Full Site Details — Location Placement", left, y, helvetica, 10, gray);
  drawText(page, data.generatedAt, right - helvetica.widthOfTextAtSize(data.generatedAt, 9), y + 14, helvetica, 9, gray);

  y -= 30;
  drawLine(page, left, y, right);

  // Prepared for
  y -= 25;
  drawText(page, "PREPARED FOR", left, y, helveticaBold, 8, gray);
  y -= 16;
  drawText(page, data.businessName, left, y, helveticaBold, 14, dark);
  y -= 16;
  drawText(page, data.contactName, left, y, helvetica, 10, gray);

  y -= 30;
  drawLine(page, left, y, right);

  // Full site details
  y -= 25;
  drawText(page, "SITE DETAILS", left, y, helveticaBold, 8, gray);

  const details = [
    ["Location Name", data.locationName],
    ["Address", data.address],
    ["Phone", data.phone],
    ["Decision Maker", data.decisionMakerName],
    ["Decision Maker Email", data.decisionMakerEmail],
    ["Industry", data.industry],
    ["Zip Code", data.zip],
    ["Employee Count", String(data.employeeCount || "—")],
    ["Foot Traffic", String(data.trafficCount || "—")],
    ["Machine Type", data.machineType || "—"],
    ["Machines Requested", String(data.machinesRequested)],
    ["Business Hours", data.businessHours],
  ];

  for (const [label, value] of details) {
    y -= 20;
    drawText(page, label, left, y, helvetica, 9, gray);
    drawText(page, value || "—", left + 160, y, helveticaBold, 10, dark);
  }

  y -= 30;
  drawLine(page, left, y, right);

  // Pricing summary
  y -= 25;
  drawText(page, "PLACEMENT SUMMARY", left, y, helveticaBold, 8, gray);
  y -= 20;
  drawText(page, "Score", left, y, helvetica, 9, gray);
  drawText(page, `${data.pricing.total_score} / 100 — ${data.pricing.tier_label}`, left + 160, y, helveticaBold, 10, dark);
  y -= 20;
  drawText(page, "Placement Fee", left, y, helvetica, 9, gray);
  drawText(page, `$${data.pricing.price.toLocaleString()} (Paid)`, left + 160, y, helveticaBold, 10, green);

  if (data.locationAgreement) {
    y -= 35;
    drawLine(page, left, y, right);

    y -= 25;
    drawText(page, "LOCATION AGREEMENT — SIGNED", left, y, helveticaBold, 8, gray);

    const laDetails: [string, string][] = [
      ["Signed By", data.locationAgreement.signatureName],
      ["Contact Name", data.locationAgreement.contactName],
    ];
    if (data.locationAgreement.titleRole) {
      laDetails.push(["Title / Role", data.locationAgreement.titleRole]);
    }
    laDetails.push(
      ["Email", data.locationAgreement.email],
      ["Phone", data.locationAgreement.phone],
    );
    if (data.locationAgreement.signedAt) {
      laDetails.push(["Signed On", new Date(data.locationAgreement.signedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })]);
    }

    for (const [label, value] of laDetails) {
      y -= 20;
      drawText(page, label, left, y, helvetica, 9, gray);
      drawText(page, value || "—", left + 160, y, helveticaBold, 10, dark);
    }

    y -= 15;
    drawText(page, "The location partner has signed a non-binding acknowledgment of intent for vending machine placement.", left, y, helvetica, 8, gray);
  }

  y -= 35;
  drawText(page, "Thank you for your purchase. This location is now exclusively assigned to you.", left, y, helvetica, 9, gray);

  drawText(page, "Vending Connector — vendingconnector.com", left, 30, helvetica, 8, gray);

  return doc.save();
}
