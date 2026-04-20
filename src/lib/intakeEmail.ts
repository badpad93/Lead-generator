import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "sales@bytebitevending.com";
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL || "admin@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface IntakeConfirmationParams {
  to: string;
  name: string;
  services: string[];
  dealId: string;
  documentLinks?: { name: string; url: string }[];
}

export async function sendIntakeConfirmation(params: IntakeConfirmationParams) {
  const { to, name, services, documentLinks } = params;

  const serviceList = services.map((s) => `<li style="padding: 4px 0;">${s}</li>`).join("");
  const docSection = documentLinks?.length
    ? `<div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin: 16px 0;">
         <p style="margin: 0 0 8px; font-weight: 600; color: #166534;">Your Documents:</p>
         ${documentLinks.map((d) => `<a href="${d.url}" style="display: block; color: #16a34a; padding: 4px 0;">${d.name}</a>`).join("")}
         <p style="margin: 8px 0 0; font-size: 12px; color: #6b7280;">Links expire in 24 hours.</p>
       </div>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #111827; font-size: 24px; margin: 0;">VendHub</h1>
        <p style="color: #6b7280; font-size: 14px; margin: 4px 0 0;">Sales Intake Confirmation</p>
      </div>

      <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 12px; font-size: 18px; color: #111827;">Thanks, ${name}!</h2>
        <p style="margin: 0 0 16px; font-size: 14px; color: #374151; line-height: 1.6;">
          We've received your intake form. A sales rep will reach out within 1 business day.
        </p>
        <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #111827;">Services requested:</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #374151;">${serviceList}</ul>
      </div>

      ${docSection}

      <p style="font-size: 13px; color: #6b7280; text-align: center;">
        Questions? Reply to this email or call us at (555) 123-4567.
      </p>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `We received your intake form — next steps inside`,
    html,
  });
}

interface AdminNotificationParams {
  leadName: string;
  email: string;
  services: string[];
  budget: string;
  timeline: string;
  dealQualityScore: number;
  dealId: string;
}

export async function sendAdminIntakeNotification(params: AdminNotificationParams) {
  const { leadName, email, services, budget, timeline, dealQualityScore, dealId } = params;
  const scoreColor = dealQualityScore >= 70 ? "#dc2626" : dealQualityScore >= 40 ? "#f59e0b" : "#6b7280";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="margin: 0 0 16px; color: #111827;">New Lead Intake Submitted</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">Name</td><td style="font-weight: 600;">${leadName}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Email</td><td>${email}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Services</td><td>${services.join(", ")}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Budget</td><td>${budget}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Timeline</td><td>${timeline}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Deal Score</td><td style="font-weight: 700; color: ${scoreColor};">${dealQualityScore}/100</td></tr>
      </table>
      <div style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/sales/deals" style="display: inline-block; background: #111827; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">View in CRM</a>
      </div>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `[Score: ${dealQualityScore}] New intake: ${leadName} — ${services[0] || "General"}`,
    html,
  });
}

interface LocationIntakeNotificationParams {
  clientName: string;
  machineCount: number;
  targetAreas: string;
  dealId: string;
}

export async function sendLocationIntakeNotification(params: LocationIntakeNotificationParams) {
  const { clientName, machineCount, targetAreas, dealId } = params;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
      <h2 style="margin: 0 0 16px; color: #111827;">New Location Request</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #6b7280;">Client</td><td style="font-weight: 600;">${clientName}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Machines</td><td>${machineCount}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Target Areas</td><td>${targetAreas}</td></tr>
      </table>
      <div style="margin-top: 20px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/sales/deals" style="display: inline-block; background: #111827; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px;">View Deal</a>
      </div>
    </div>
  `;

  return getResend().emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `Location request: ${clientName} — ${machineCount} machines in ${targetAreas}`,
    html,
  });
}
