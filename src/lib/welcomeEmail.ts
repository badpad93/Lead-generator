import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const ADMIN_EMAIL = "james@apexaivending.com";
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

export async function sendWelcomeEmail(params: {
  to: string;
  firstName: string;
  role: "operator" | "locator" | "location_manager";
}) {
  const { to, firstName, role } = params;

  const steps =
    role === "locator"
      ? `
            <li style="margin-bottom:8px;">Complete your profile</li>
            <li style="margin-bottom:8px;">Create your first listing</li>
            <li>Track your listing status</li>`
      : role === "location_manager"
        ? `
            <li style="margin-bottom:8px;">Complete your profile</li>
            <li style="margin-bottom:8px;">Post a vending request or browse operators</li>
            <li>Get matched with an operator</li>`
        : `
            <li style="margin-bottom:8px;">Complete your profile</li>
            <li style="margin-bottom:8px;">Browse available locations</li>
            <li>Purchase leads and grow your business</li>`;

  const isLocator = role === "locator";

  await resend.emails.send({
    from: FROM,
    to,
    subject: isLocator
      ? "Welcome to Vending Connector — Your Account is Under Review"
      : "Welcome to Vending Connector — Let's Get Started",
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
          ${isLocator
            ? "Your seller account is currently under review. Our team will review your application and notify you once you're approved to start listing locations."
            : "Your account is all set up and ready to go."}
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

  if (isLocator) {
    await sendLocatorSignupAdminNotification({ name: firstName, email: to });
  }
}

export async function sendLocatorSignupAdminNotification(params: {
  name: string;
  email: string;
}) {
  const { name, email } = params;
  const adminUrl = `${APP_URL}/admin`;

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `New Locator Signup — ${name} (${email})`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;font-weight:600;">
          New Locator Account Pending Approval
        </p>
        <div style="margin:16px 0;padding:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;">
          <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
            <tr><td style="padding:4px 8px;font-weight:600;">Name</td><td style="padding:4px 8px;">${name}</td></tr>
            <tr><td style="padding:4px 8px;font-weight:600;">Email</td><td style="padding:4px 8px;">${email}</td></tr>
          </table>
        </div>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          A new user has signed up as a Locator (seller). Please review their account and
          approve or reject them in the admin panel.
        </p>
        <div style="margin:24px 0;">
          <a href="${adminUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Review in Admin Panel
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}

export async function sendLocatorApprovedEmail(params: {
  to: string;
  firstName: string;
}) {
  const { to, firstName } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your Locator Account Has Been Approved!",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${firstName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Great news! Your Locator account has been approved. You can now create listings
          and start selling location leads on the Vending Connector marketplace.
        </p>
        <div style="margin:24px 0;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
          <p style="color:#166534;font-size:14px;font-weight:600;margin:0 0 12px 0;">Next steps:</p>
          <ol style="color:#374151;font-size:13px;margin:0;padding-left:20px;">
            <li style="margin-bottom:8px;">Complete your profile if you haven't already</li>
            <li style="margin-bottom:8px;">Create your first listing</li>
            <li>Start earning when operators purchase your leads</li>
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

export async function sendLocatorRejectedEmail(params: {
  to: string;
  firstName: string;
}) {
  const { to, firstName } = params;

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Vending Connector — Account Update",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="margin-bottom:24px;">
          <span style="font-size:20px;font-weight:700;color:#16a34a;">Vending Connector</span>
        </div>
        <p style="color:#111827;font-size:15px;line-height:1.6;">
          Hi ${firstName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Thank you for your interest in becoming a Locator on Vending Connector.
          After review, we're unable to approve your seller account at this time.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          If you believe this was a mistake or would like more information, please
          contact our team and we'll be happy to help.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}
