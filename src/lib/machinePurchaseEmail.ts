import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface ThankYouParams {
  to: string;
  buyerName: string;
  machineTitle: string;
  amountCents: number;
  purchaseId: string;
  stripePaymentIntentId: string | null;
}

export async function sendMachinePurchaseThankYouEmail(params: ThankYouParams) {
  const { to, buyerName, machineTitle, amountCents, purchaseId, stripePaymentIntentId } = params;
  const amount = `$${(amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Order Confirmed — ${machineTitle}`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#16a34a;font-size:22px;margin:0 0 20px;">Thank You for Your Purchase!</h1>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Hi ${buyerName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          Thank you for shopping with <strong>Vending Connector</strong>! Your order has been confirmed and our team is preparing your machine for fulfillment. Keep an eye on your email for next steps.
        </p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:24px 0;">
          <h2 style="color:#111827;font-size:16px;margin:0 0 16px;">Order Summary</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;">Item</td>
              <td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;font-weight:600;">${machineTitle}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;">Amount Paid</td>
              <td style="padding:8px 0;color:#16a34a;font-size:13px;text-align:right;font-weight:700;">${amount}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;">Date</td>
              <td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;">${date}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;">Order ID</td>
              <td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;">${purchaseId.slice(0, 8).toUpperCase()}</td>
            </tr>
            ${stripePaymentIntentId ? `
            <tr>
              <td style="padding:8px 0;color:#6b7280;font-size:13px;">Payment Reference</td>
              <td style="padding:8px 0;color:#111827;font-size:13px;text-align:right;">${stripePaymentIntentId}</td>
            </tr>` : ""}
          </table>
        </div>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:16px;margin:24px 0;text-align:center;">
          <p style="color:#166534;font-size:14px;margin:0;font-weight:600;">What happens next?</p>
          <p style="color:#374151;font-size:13px;margin:8px 0 0;">
            Our team will review your order and reach out with shipping details and onboarding instructions.
          </p>
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}

interface NotificationParams {
  to: string | string[];
  purchase: Record<string, unknown>;
  machineTitle: string;
  listing: Record<string, unknown> | null;
}

export async function sendMachinePurchaseNotificationEmail(params: NotificationParams) {
  const { to, purchase, machineTitle, listing } = params;
  const amount = `$${(Number(purchase.amount_cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  const businessAddr = [purchase.business_address, purchase.business_city, purchase.business_state, purchase.business_zip]
    .filter(Boolean).join(", ") || "—";

  const locationRows = purchase.location_status === "confirmed"
    ? `
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Location Business</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.location_business_name || "—"}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Location Address</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.location_address || "—"}, ${purchase.location_city || ""} ${purchase.location_state || ""} ${purchase.location_zip || ""}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Site Contact</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.site_contact_name || "—"} — ${purchase.site_contact_phone || ""} — ${purchase.site_contact_email || ""}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Placement Type</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.placement_type || "—"}</td></tr>
    `
    : `
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Preferred Market</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.preferred_market || "—"}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Desired Location Type</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.desired_location_type || "—"}</td></tr>
      <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Foot Traffic</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.foot_traffic || "—"}</td></tr>
    `;

  const readiness = [
    purchase.has_power_outlet && "Power outlet",
    purchase.has_indoor_placement && "Indoor placement",
    purchase.has_enough_space && "Enough space",
    purchase.has_delivery_access && "Delivery access",
  ].filter(Boolean).join(", ") || "None checked";

  await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `New Machine Purchase: ${String(purchase.full_name)} — ${machineTitle} (${amount})`,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#111827;font-size:22px;margin:0 0 20px;">New Machine Purchase</h1>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
          <p style="color:#166534;font-size:14px;margin:0;font-weight:600;">${machineTitle} — ${amount}</p>
        </div>

        <h3 style="color:#374151;font-size:14px;margin:16px 0 8px;">Buyer Information</h3>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Name</td><td style="padding:6px 12px;color:#111827;font-size:13px;font-weight:600;">${purchase.full_name}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Email</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.email}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Phone</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.phone || "—"}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Buyer Type</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.buyer_type || "—"}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Business Name</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.business_name || "—"}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Business Address</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${businessAddr}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">LLC Status</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.llc_status || "—"}</td></tr>
        </table>

        <h3 style="color:#374151;font-size:14px;margin:16px 0 8px;">Location — ${purchase.location_status || "Unknown"}</h3>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
          ${locationRows}
        </table>

        <h3 style="color:#374151;font-size:14px;margin:16px 0 8px;">Deployment & Readiness</h3>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:8px;overflow:hidden;">
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Timeline</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.deployment_timeline || "—"}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Site Readiness</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${readiness}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Connectivity</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.connectivity || "—"}</td></tr>
          <tr><td style="padding:6px 12px;color:#6b7280;font-size:13px;">Shipping Intent</td><td style="padding:6px 12px;color:#111827;font-size:13px;">${purchase.shipping_intent || "—"}</td></tr>
        </table>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="color:#9ca3af;font-size:11px;">Vending Connector — vendingconnector.com</p>
      </div>
    `,
  });
}

interface OnboardingParams {
  to: string;
  buyerName: string;
}

export async function sendMachineOnboardingEmail(params: OnboardingParams) {
  const { to, buyerName } = params;

  await getResend().emails.send({
    from: "james@apexaivending.com",
    to,
    subject: "Next Steps — WeVend Payment Processing & Vendera Operator Account Setup",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <p style="color:#374151;font-size:14px;line-height:1.7;">
          Hi ${buyerName},
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.7;">
          Thank you for your purchase! To get your machine up and running, please complete the two steps below:
        </p>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:24px 0;">
          <h2 style="color:#166534;font-size:16px;margin:0 0 12px;">Step 1 – WeVend Payment Processing Application</h2>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">
            WeVend is the payment processor that handles all credit and debit card transactions on your Vendera machine.
            Please complete the application at the link below:
          </p>
          <p style="margin:0 0 16px;">
            <a href="https://form.jotform.com/Wevend/Vendera" style="color:#16a34a;font-weight:600;font-size:14px;">https://form.jotform.com/Wevend/Vendera</a>
          </p>
          <p style="color:#374151;font-size:13px;line-height:1.7;margin:0;">
            It is important that all information is entered accurately and matches your business records, including:
          </p>
          <ul style="color:#374151;font-size:13px;line-height:1.8;margin:8px 0 0;padding-left:20px;">
            <li>Business name and address</li>
            <li>EIN document showing the registered business address</li>
            <li>Owner information</li>
            <li>Bank account details (voided check or bank letter)</li>
          </ul>
        </div>

        <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:20px;margin:24px 0;">
          <h2 style="color:#1e40af;font-size:16px;margin:0 0 12px;">Step 2 – Create Your Vendera Operator Account</h2>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">
            This account gives you access to the Vendera app to manage your machine, view sales, monitor inventory, and receive alerts.
          </p>
          <p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">
            Please go to the link below and click "Apply as Operator" to create your account:
          </p>
          <p style="margin:0;">
            <a href="https://vms.vendera.ai/login" style="color:#1e40af;font-weight:600;font-size:14px;">https://vms.vendera.ai/login</a>
          </p>
        </div>

        <p style="color:#374151;font-size:14px;line-height:1.7;">
          Once both steps are completed, our team will connect your payment processing and activate your machine so it is ready to accept payments and go live.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.7;">
          If you have any questions while filling this out, feel free to reach out.
        </p>
        <p style="color:#374151;font-size:14px;line-height:1.7;margin-top:24px;">
          Thank you,<br />
          <strong>James Padden</strong><br />
          <span style="color:#6b7280;font-size:13px;">Apex AI Vending</span>
        </p>
      </div>
    `,
  });
}
