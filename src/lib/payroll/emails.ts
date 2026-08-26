import { Resend } from "resend";
import { APEX_ADMIN_NOTIFY } from "@/lib/adminNotifyRecipients";

/**
 * Payroll onboarding transactional emails.
 *
 * Security constraints (per spec §"SECURITY ARCHITECTURE")
 *   * Never include an SSN, TIN, bank number, or W-4 amount in an
 *     email body — even in an admin-facing notification. Emails
 *     carry names + status + a link to log in.
 *   * The invitation URL contains the raw one-time token (that IS
 *     the credential); no other payroll data appears in the URL.
 */

const FROM = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";
const REPLY_TO = process.env.PAYROLL_REPLY_TO || "james@apexaivending.com";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

function shell(body: string): string {
  return `<div style="font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.15em;color:#16A34A;text-transform:uppercase">
        Vending Connector · Apex AI Vending
      </div>
    </div>
    ${body}
    <p style="color:#888;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;line-height:1.6">
      Questions? Reply to this email or contact <a href="mailto:${REPLY_TO}" style="color:#16A34A">${REPLY_TO}</a>.
    </p>
  </div>`;
}

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

/** Employee/contractor invitation to complete their payroll packet. */
export async function sendPayrollInvitationEmail(args: {
  toEmail: string;
  recipientName: string | null;
  classification: "w2_employee" | "1099_contractor";
  packetUrl: string;
  companyName?: string | null;
}): Promise<void> {
  const first = (args.recipientName || "there").trim().split(/\s+/)[0];
  const classLabel = args.classification === "w2_employee" ? "W-2 employee" : "1099 contractor";
  const html = shell(`
    <h1 style="font-size:22px;font-weight:700;margin:0 0 12px">Complete Your Payroll Setup</h1>
    <p style="line-height:1.6;color:#374151;margin:0 0 12px">Hi ${esc(first)},</p>
    <p style="line-height:1.6;color:#374151;margin:0 0 12px">
      Welcome to the team! We need a few pieces of information from you before we can complete your payroll setup as a <strong>${esc(classLabel)}</strong>${args.companyName ? ` at <strong>${esc(args.companyName)}</strong>` : ""}.
    </p>
    <p style="line-height:1.6;color:#374151;margin:0 0 16px">
      Please use the secure link below to complete your payroll information.
    </p>
    <p style="margin:0 0 20px">
      <a href="${esc(args.packetUrl)}" style="display:inline-block;background:#16A34A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Complete Payroll Setup</a>
    </p>
    <p style="line-height:1.5;color:#6b7280;font-size:12px;margin:16px 0 0">
      <strong>For your security</strong>, please do not email Social Security numbers, banking information, tax forms, or other sensitive information to us — the secure link above is the only intended way to submit that data.
    </p>
    <p style="line-height:1.5;color:#6b7280;font-size:12px;margin:8px 0 0">
      If you have any questions regarding your payroll setup, please contact your manager.
    </p>
    <p style="line-height:1.6;color:#374151;margin:16px 0 0">Thank you,<br>Vending Connector</p>
  `);

  const result = await getResend().emails.send({
    from: FROM,
    to: [args.toEmail],
    replyTo: REPLY_TO,
    subject: "Complete Your Payroll Setup – Vending Connector",
    html,
  });
  if (result.error) {
    throw new Error(`Resend rejected payroll invitation: ${result.error.message}`);
  }
}

/** Admin notification when a worker submits their packet. Names + status only. */
export async function sendPayrollAdminReviewEmail(args: {
  recipientName: string | null;
  recipientEmail: string;
  classification: "w2_employee" | "1099_contractor";
  reviewUrl: string;
}): Promise<void> {
  const classLabel = args.classification === "w2_employee" ? "W-2 employee" : "1099 contractor";
  const html = shell(`
    <h1 style="font-size:20px;font-weight:700;margin:0 0 12px">Payroll onboarding completed</h1>
    <p style="line-height:1.6;color:#374151;margin:0 0 12px">
      A payroll packet has been submitted and is ready for administrator review.
    </p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0">
      <div style="font-size:14px;color:#111827"><strong>Worker:</strong> ${esc(args.recipientName ?? args.recipientEmail)}</div>
      <div style="font-size:14px;color:#111827"><strong>Email:</strong> ${esc(args.recipientEmail)}</div>
      <div style="font-size:14px;color:#111827"><strong>Classification:</strong> ${esc(classLabel)}</div>
    </div>
    <p style="line-height:1.6;color:#374151;margin:0 0 12px">
      Log in to Vending Connector to review the record. Sensitive fields (SSN, TIN, bank details) remain masked in the CRM and are never included in this notification.
    </p>
    <p style="margin:0 0 20px">
      <a href="${esc(args.reviewUrl)}" style="display:inline-block;background:#16A34A;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open payroll record</a>
    </p>
  `);
  const result = await getResend().emails.send({
    from: FROM,
    to: [...APEX_ADMIN_NOTIFY],
    replyTo: REPLY_TO,
    subject: `Payroll onboarding completed for ${args.recipientName ?? args.recipientEmail}`,
    html,
  });
  if (result.error) {
    console.error("[payroll] admin review email failed:", result.error.message);
    // non-fatal — submission already succeeded
  }
}
