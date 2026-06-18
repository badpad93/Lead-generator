import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

export async function sendWelcomeEmail(params: {
  to: string;
  firstName: string;
  role: "operator" | "location_manager";
}) {
  const { to, firstName, role } = params;

  const steps =
    role === "location_manager"
      ? `
            <li style="margin-bottom:8px;">Complete your profile</li>
            <li style="margin-bottom:8px;">Create your first listing</li>
            <li>Track your listing status</li>`
      : `
            <li style="margin-bottom:8px;">Complete your profile</li>
            <li style="margin-bottom:8px;">Browse available locations</li>
            <li>Purchase leads and grow your business</li>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Vending Connector — Let's Get Started",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${firstName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Welcome to Vending Connector! We're thrilled to have you on board.
          Your account is all set up and ready to go.
        </p>
        <div style="margin:24px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
          <p style="color:#166534;font-size:14px;font-weight:600;margin:0 0 12px 0;">Here's how to get started:</p>
          <ol style="color:#374151;font-size:13px;margin:0;padding-left:20px;">
            ${steps}
          </ol>
        </div>
        <div style="margin:24px 0;">
          <a href="${APP_URL}/dashboard" style="display:inline-block;background:#16a34a;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Go to Dashboard
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}
