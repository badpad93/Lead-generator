import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const ADMIN_EMAIL = "james@apexaivending.com";

export async function sendAgreementSignedNotification(params: {
  type: "sales" | "location";
  signatureName: string;
  recipientName: string;
  recipientEmail: string;
  businessName: string;
  signedAt: string;
  pipelineItemId?: string | null;
  price?: number | null;
}) {
  const { type, signatureName, recipientName, recipientEmail, businessName, signedAt, pipelineItemId, price } = params;
  const label = type === "sales" ? "Sales Agreement" : "Location Agreement";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

  const pipelineLink = pipelineItemId
    ? `<tr><td style="padding:4px 8px;color:#6b7280;">Pipeline</td><td style="padding:4px 8px;"><a href="${appUrl}/sales" style="color:#16a34a;">View in CRM</a></td></tr>`
    : "";

  const priceRow = price
    ? `<tr><td style="padding:4px 8px;color:#6b7280;">Placement Fee</td><td style="padding:4px 8px;font-weight:600;color:#16a34a;">$${price.toLocaleString()}</td></tr>`
    : "";

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `${label} Signed — ${businessName || recipientName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
          <p style="margin:0;color:#166534;font-size:16px;font-weight:700;">✓ ${label} Signed</p>
        </div>
        <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
          <tr><td style="padding:4px 8px;color:#6b7280;">Signed By</td><td style="padding:4px 8px;font-weight:600;">${signatureName}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Contact</td><td style="padding:4px 8px;">${recipientName}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Email</td><td style="padding:4px 8px;">${recipientEmail}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Business</td><td style="padding:4px 8px;">${businessName || "—"}</td></tr>
          ${priceRow}
          <tr><td style="padding:4px 8px;color:#6b7280;">Signed At</td><td style="padding:4px 8px;">${new Date(signedAt).toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</td></tr>
          ${pipelineLink}
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}

export async function sendAgreementEmail(params: {
  to: string;
  recipientName: string;
  businessName: string;
  price: number;
  agreementUrl: string;
  pdfBuffer: Uint8Array;
}) {
  const { to, recipientName, businessName, price, agreementUrl, pdfBuffer } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Location Placement Agreement — $${price.toLocaleString()}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${recipientName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Your Location Placement Agreement for <strong>${businessName}</strong> is ready for review.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">PLACEMENT FEE</p>
          <p style="margin:0;color:#16a34a;font-size:24px;font-weight:700;">$${price.toLocaleString()}</p>
        </div>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Please review the agreement, sign, and complete payment to receive the full site details.
        </p>
        <div style="margin:24px 0;">
          <a href="${agreementUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Review &amp; Sign Agreement
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;">
          A PDF copy is attached for your records. You can also access the agreement at:<br>
          <a href="${agreementUrl}" style="color:#16a34a;">${agreementUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
    attachments: [
      {
        filename: "Location-Placement-Agreement.pdf",
        content: Buffer.from(pdfBuffer),
      },
    ],
  });
}

export async function sendFullSiteDetailsEmail(params: {
  to: string;
  recipientName: string;
  businessName: string;
  locationName: string;
  pdfBuffer: Uint8Array;
  locationAgreement?: {
    signatureName: string;
    signedAt: string;
    contactName: string;
    email: string;
    phone: string;
  };
}) {
  const { to, recipientName, businessName, locationName, pdfBuffer, locationAgreement } = params;

  const agreementSection = locationAgreement
    ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">LOCATION AGREEMENT — SIGNED</p>
          <p style="margin:0 0 4px;color:#16a34a;font-size:14px;font-weight:700;">✓ Location partner has confirmed intent</p>
          <table style="margin-top:10px;font-size:13px;color:#374151;border-collapse:collapse;">
            <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Signed By</td><td style="padding:2px 0;font-weight:600;">${locationAgreement.signatureName}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Contact</td><td style="padding:2px 0;">${locationAgreement.contactName}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Email</td><td style="padding:2px 0;">${locationAgreement.email}</td></tr>
            <tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Phone</td><td style="padding:2px 0;">${locationAgreement.phone}</td></tr>
            ${locationAgreement.signedAt ? `<tr><td style="padding:2px 12px 2px 0;color:#6b7280;">Signed On</td><td style="padding:2px 0;">${new Date(locationAgreement.signedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td></tr>` : ""}
          </table>
        </div>
      `
    : "";

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Full Site Details — ${locationName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${recipientName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Thank you for your payment! Here are the full site details for your location placement at <strong>${locationName}</strong>.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 4px;color:#6b7280;font-size:12px;">STATUS</p>
          <p style="margin:0;color:#16a34a;font-size:16px;font-weight:700;">✓ Payment Complete — Site Details Attached</p>
        </div>
        ${agreementSection}
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          The attached PDF contains all site information including the location address, decision maker contact details, and placement specifications.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          If you have any questions, reply to this email and our team will assist you.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
    attachments: [
      {
        filename: `Site-Details-${locationName.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`,
        content: Buffer.from(pdfBuffer),
      },
    ],
  });
}
