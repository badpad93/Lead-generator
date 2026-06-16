import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";
const ADMIN_EMAIL = "james@apexaivending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface SaleParams {
  to: string;
  listingTitle: string;
  amount: number;
  buyerEmail: string;
}

export async function sendMarketplaceSaleEmail(params: SaleParams) {
  const { to, listingTitle, amount, buyerEmail } = params;
  const formattedAmount = `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const platformFee = `$${(amount * 0.15).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const payout = `$${(amount * 0.85).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Your listing sold! — ${listingTitle}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#16a34a;font-size:22px;margin:0 0 20px;">Your Listing Has Been Sold!</h1>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Great news — <strong>${listingTitle}</strong> has been purchased by ${buyerEmail}.
        </p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Sale Price</td><td style="padding:8px 0;text-align:right;font-weight:600;color:#111;">${formattedAmount}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;font-size:13px;">Platform Fee (15%)</td><td style="padding:8px 0;text-align:right;color:#111;">-${platformFee}</td></tr>
          <tr style="border-top:1px solid #e5e7eb;"><td style="padding:8px 0;color:#111;font-weight:600;font-size:14px;">Your Payout</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#16a34a;font-size:16px;">${payout}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:13px;line-height:1.6;">
          Your payout will be sent to you via your preferred payout method on file. Please ensure your payout details are up to date in your profile settings.
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">— VendingConnector Marketplace</p>
      </div>
    `,
  });
}

interface PurchaseParams {
  to: string;
  listingTitle: string;
  amount: number;
  listingType: string;
  location: string;
}

export async function sendMarketplacePurchaseEmail(params: PurchaseParams) {
  const { to, listingTitle, amount, listingType, location } = params;
  const formattedAmount = `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const typeLabel = listingType === "lead" ? "Vending Lead" : listingType === "location" ? "Location" : "Route";

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Purchase Confirmed — ${listingTitle}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#16a34a;font-size:22px;margin:0 0 20px;">Purchase Confirmed!</h1>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          You've successfully purchased the following listing:
        </p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px;font-weight:600;color:#111;">${listingTitle}</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Type: ${typeLabel}</p>
          <p style="margin:0 0 4px;color:#6b7280;font-size:13px;">Location: ${location}</p>
          <p style="margin:0;font-weight:600;color:#111;font-size:16px;">${formattedAmount}</p>
        </div>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          The seller has been notified and will provide any additional details. If you have questions, please contact us.
        </p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px;">— VendingConnector Marketplace</p>
      </div>
    `,
  });
}

interface AdminPayoutNotificationParams {
  listingTitle: string;
  saleAmount: number;
  platformFee: number;
  sellerPayout: number;
  sellerName: string;
  sellerEmail: string;
  buyerEmail: string;
  payoutMethod: string | null;
  payoutEmail: string | null;
  payoutBankName: string | null;
  payoutRoutingNumber: string | null;
  payoutAccountNumber: string | null;
  payoutNotes: string | null;
  purchaseId: string;
}

export async function sendMarketplacePayoutNotification(params: AdminPayoutNotificationParams) {
  const {
    listingTitle, saleAmount, platformFee, sellerPayout,
    sellerName, sellerEmail, buyerEmail,
    payoutMethod, payoutEmail, payoutBankName,
    payoutRoutingNumber, payoutAccountNumber, payoutNotes,
    purchaseId,
  } = params;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const hasPayoutInfo = payoutMethod || payoutEmail || payoutBankName;

  const payoutDetailsHtml = hasPayoutInfo
    ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;font-weight:700;color:#166534;font-size:13px;">SELLER PAYOUT DETAILS</p>
        <table style="font-size:13px;color:#374151;border-collapse:collapse;">
          ${payoutMethod ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Method</td><td style="padding:3px 0;font-weight:600;">${payoutMethod}</td></tr>` : ""}
          ${payoutEmail ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Email/Zelle</td><td style="padding:3px 0;">${payoutEmail}</td></tr>` : ""}
          ${payoutBankName ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Bank</td><td style="padding:3px 0;">${payoutBankName}</td></tr>` : ""}
          ${payoutRoutingNumber ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Routing #</td><td style="padding:3px 0;">${payoutRoutingNumber}</td></tr>` : ""}
          ${payoutAccountNumber ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Account #</td><td style="padding:3px 0;">${payoutAccountNumber}</td></tr>` : ""}
          ${payoutNotes ? `<tr><td style="padding:3px 12px 3px 0;color:#6b7280;">Notes</td><td style="padding:3px 0;">${payoutNotes}</td></tr>` : ""}
        </table>
      </div>
    `
    : `
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">⚠ Seller has NOT set up payout details. Contact them at ${sellerEmail} to arrange payment.</p>
      </div>
    `;

  await getResend().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `Marketplace Sale — Payout Required — ${listingTitle}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="margin-bottom:20px;">
          <span style="font-size:18px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <div style="background:#dbeafe;border:1px solid #93c5fd;border-radius:8px;padding:14px;margin-bottom:20px;">
          <p style="margin:0;color:#1e40af;font-size:15px;font-weight:700;">💰 Marketplace Sale — Seller Payout Required</p>
        </div>
        <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;margin-bottom:8px;">
          <tr><td style="padding:4px 8px;color:#6b7280;">Listing</td><td style="padding:4px 8px;font-weight:600;">${listingTitle}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Sale Amount</td><td style="padding:4px 8px;">${fmt(saleAmount)}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;">Platform Fee (15%)</td><td style="padding:4px 8px;">-${fmt(platformFee)}</td></tr>
          <tr><td style="padding:4px 8px;color:#6b7280;font-weight:600;">Seller Payout</td><td style="padding:4px 8px;font-weight:700;color:#16a34a;">${fmt(sellerPayout)}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;">
        <table style="width:100%;font-size:13px;color:#374151;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6b7280;">Seller</td><td style="padding:3px 8px;">${sellerName}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Seller Email</td><td style="padding:3px 8px;">${sellerEmail}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Buyer Email</td><td style="padding:3px 8px;">${buyerEmail}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Purchase ID</td><td style="padding:3px 8px;font-family:monospace;font-size:11px;">${purchaseId}</td></tr>
        </table>
        ${payoutDetailsHtml}
        <p style="color:#6b7280;font-size:12px;line-height:1.6;margin-top:16px;">
          After sending the payout, mark it as completed in the Admin panel under Marketplace.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}
