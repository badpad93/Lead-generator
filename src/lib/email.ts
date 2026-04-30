import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptEmailParams {
  to: string;
  leadTitle: string;
  leadLocation: string; // "City, State"
  purchaseDate: string; // ISO string
  amountCents: number;
  orderId: string; // purchase UUID
}

interface LeadDetailsEmailParams {
  to: string;
  leadTitle: string;
  leadLocation: string;
  locationName: string | null;
  address: string | null;
  zip: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  decisionMakerName: string | null;
  description: string | null;
  isComplete: boolean; // all key fields present?
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Receipt Email
// ---------------------------------------------------------------------------

export async function sendReceiptEmail(params: ReceiptEmailParams) {
  const { to, leadTitle, leadLocation, purchaseDate, amountCents, orderId } =
    params;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">ByteBite Vending</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Purchase Receipt</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">Payment Confirmed</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Lead</td>
            <td style="padding: 8px 0; text-align: right; color: #111827; font-weight: 600;">${leadTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Location</td>
            <td style="padding: 8px 0; text-align: right; color: #111827;">${leadLocation}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Date</td>
            <td style="padding: 8px 0; text-align: right; color: #111827;">${formatDate(purchaseDate)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Order ID</td>
            <td style="padding: 8px 0; text-align: right; color: #111827; font-family: monospace; font-size: 12px;">${orderId}</td>
          </tr>
          <tr style="border-top: 1px solid #e5e7eb;">
            <td style="padding: 12px 0 0; color: #111827; font-weight: 700;">Amount Paid</td>
            <td style="padding: 12px 0 0; text-align: right; color: #16a34a; font-weight: 700; font-size: 18px;">${formatCurrency(amountCents)}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Thank you for your purchase! If you have questions, contact us at
        <a href="mailto:james@apexaivending.com" style="color: #16a34a;">james@apexaivending.com</a>
        or call <a href="tel:+18888511462" style="color: #16a34a;">(888) 851-1462</a>
      </p>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Receipt: ${leadTitle} — ${formatCurrency(amountCents)}`,
    html,
  });
}

// ---------------------------------------------------------------------------
// Lead Details Email
// ---------------------------------------------------------------------------

export async function sendLeadDetailsEmail(params: LeadDetailsEmailParams) {
  const {
    to,
    leadTitle,
    leadLocation,
    locationName,
    address,
    zip,
    contactPhone,
    contactEmail,
    decisionMakerName,
    description,
    isComplete,
  } = params;

  const detailRow = (label: string, value: string | null) =>
    value
      ? `<tr>
           <td style="padding: 8px 0; color: #6b7280; vertical-align: top;">${label}</td>
           <td style="padding: 8px 0; color: #111827; font-weight: 500;">${value}</td>
         </tr>`
      : "";

  const incompleteNotice = !isComplete
    ? `<div style="background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
         <p style="margin: 0; font-size: 14px; color: #92400e;">
           <strong>Note:</strong> Some lead details are still being gathered.
           Complete information will be sent to this email within 5–10 minutes.
         </p>
       </div>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">ByteBite Vending</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Your Lead Details</p>
      </div>

      ${incompleteNotice}

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #111827;">${leadTitle}</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${detailRow("Location", leadLocation)}
          ${detailRow("Location Name", locationName)}
          ${detailRow("Address", address)}
          ${detailRow("Zip Code", zip)}
          ${detailRow("Decision Maker", decisionMakerName)}
          ${detailRow("Phone", contactPhone)}
          ${detailRow("Email", contactEmail)}
        </table>
      </div>

      ${
        description
          ? `<div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
               <h3 style="margin: 0 0 8px; font-size: 15px; color: #111827;">Description</h3>
               <p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-line;">${description}</p>
             </div>`
          : ""
      }

      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Questions? Contact us at
        <a href="mailto:james@apexaivending.com" style="color: #16a34a;">james@apexaivending.com</a>
        or call <a href="tel:+18888511462" style="color: #16a34a;">(888) 851-1462</a>
      </p>
    </div>
  `;

  const subject = isComplete
    ? `Lead Details: ${leadTitle}`
    : `Lead Details (Partial): ${leadTitle} — full info coming shortly`;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
}

// ---------------------------------------------------------------------------
// Purchase Confirmation Email
// ---------------------------------------------------------------------------

interface PurchaseConfirmationEmailParams {
  to: string;
  leadTitle: string;
  locationName: string | null;
}

export async function sendPurchaseConfirmationEmail(
  params: PurchaseConfirmationEmailParams
) {
  const { to, leadTitle, locationName } = params;
  const displayName = locationName || leadTitle;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">Vending Connector</h1>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Your purchase is confirmed!</h2>
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
          Thank you for purchasing the lead for <strong>${displayName}</strong>.
        </p>
        <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
          Full location details including the address, contact name, and phone number will be sent to your email within the next few minutes.
        </p>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 0;">
        — Vending Connector Team
      </p>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject:
      "Your lead purchase is confirmed — details coming shortly",
    html,
  });
}

// ---------------------------------------------------------------------------
// Helper: check if lead has all contact fields
// ---------------------------------------------------------------------------

export function isLeadInfoComplete(lead: {
  contact_phone: string | null;
  address: string | null;
  decision_maker_name: string | null;
  contact_email: string | null;
}): boolean {
  return !!(
    lead.contact_phone &&
    lead.address &&
    lead.decision_maker_name &&
    lead.contact_email
  );
}

// ---------------------------------------------------------------------------
// Lead Assignment Notification Email
// ---------------------------------------------------------------------------

interface LeadAssignmentEmailParams {
  to: string;
  assigneeName: string;
  leads: {
    business_name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
  }[];
}

export async function sendLeadAssignmentEmail(params: LeadAssignmentEmailParams) {
  const { to, assigneeName, leads } = params;

  const leadRows = leads
    .map(
      (lead) => `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #111827; font-weight: 600;">${lead.business_name}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${lead.contact_name || "—"}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${lead.phone || "—"}</td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; color: #374151;">${[lead.city, lead.state].filter(Boolean).join(", ") || "—"}</td>
        </tr>`
    )
    .join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 640px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #16a34a; font-size: 24px; margin: 0;">Vending Connector</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">New Lead Assignment</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.6;">
          Hello${assigneeName ? ` ${assigneeName}` : ""}!
        </p>
        <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.6;">
          You have some new leads. Please begin the process of achieving the goals for our customers so that we can provide them with an excellent experience. Thank you!
        </p>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px;">
          <thead>
            <tr style="background: #e5e7eb;">
              <th style="padding: 8px 12px; text-align: left; color: #374151; font-weight: 600;">Business</th>
              <th style="padding: 8px 12px; text-align: left; color: #374151; font-weight: 600;">Contact</th>
              <th style="padding: 8px 12px; text-align: left; color: #374151; font-weight: 600;">Phone</th>
              <th style="padding: 8px 12px; text-align: left; color: #374151; font-weight: 600;">Location</th>
            </tr>
          </thead>
          <tbody>
            ${leadRows}
          </tbody>
        </table>
      </div>

      <p style="font-size: 13px; color: #6b7280; text-align: center; margin: 0;">
        — Vending Connector Team
      </p>
    </div>
  `;

  const subject = leads.length === 1
    ? `New Lead Assigned: ${leads[0].business_name}`
    : `${leads.length} New Leads Assigned`;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
  });
}
