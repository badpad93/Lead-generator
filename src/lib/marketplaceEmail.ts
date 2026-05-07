import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";

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
          Your payout will be deposited to your connected bank account via Stripe. You can check your payout status in your Stripe Express Dashboard.
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
