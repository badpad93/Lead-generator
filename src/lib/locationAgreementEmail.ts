import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";

export async function sendLocationAgreementEmail(params: {
  to: string;
  recipientName: string;
  businessName: string;
  agreementUrl: string;
}) {
  const { to, recipientName, businessName, agreementUrl } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Location Placement Agreement — ${businessName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Apex AI Vending</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${recipientName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          We're excited to move forward with vending machine placement at <strong>${businessName}</strong>!
          Please review and sign the Location Placement Acknowledgment &amp; Intent Agreement below.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          This agreement confirms your intent to allow the placement of one or more vending machines at your location.
          It is not a binding long-term contract — simply an acknowledgment of mutual interest.
        </p>
        <div style="margin:24px 0;">
          <a href="${agreementUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Review &amp; Sign Agreement
          </a>
        </div>
        <p style="color:#9ca3af;font-size:12px;">
          You can also access the agreement at:<br>
          <a href="${agreementUrl}" style="color:#16a34a;">${agreementUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Apex AI Vending — vendingconnector.com</p>
      </div>
    `,
  });
}
