import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const PHONE = "(888) 851-1462";

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

export async function sendLocationMatchedEmail(params: {
  to: string;
  recipientName: string;
  businessName: string;
  locationName: string;
}) {
  const { to, recipientName, businessName, locationName } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Great news — an operator is interested in ${locationName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Apex AI Vending</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${recipientName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          We have a vending operator interested in placing machines at <strong>${locationName}</strong>
          (${businessName}). We're currently working to finalize the placement details.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          No action is needed from you right now — we'll keep you updated as things progress.
          If you have any questions, feel free to call us at <strong>${PHONE}</strong>.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Apex AI Vending — vendingconnector.com</p>
      </div>
    `,
  });
}

export async function sendLocationDealClosedEmail(params: {
  to: string;
  recipientName: string;
  businessName: string;
  locationName: string;
}) {
  const { to, recipientName, businessName, locationName } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Placement confirmed — ${locationName}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Apex AI Vending</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${recipientName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Great news! A vending operator has confirmed placement at <strong>${locationName}</strong>
          (${businessName}). The deal is finalized and your location will be receiving a vending machine.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Our team will be in touch to coordinate the installation timeline and next steps.
          If you have any questions, call us at <strong>${PHONE}</strong>.
        </p>
        <div style="margin:24px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
          <p style="color:#166534;font-size:14px;font-weight:600;margin:0;">What happens next?</p>
          <ul style="color:#374151;font-size:13px;margin:8px 0 0 0;padding-left:20px;">
            <li>Our team will schedule the machine installation</li>
            <li>The operator will reach out to confirm details</li>
            <li>You'll start generating revenue from your vending machine</li>
          </ul>
        </div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Apex AI Vending — vendingconnector.com</p>
      </div>
    `,
  });
}
