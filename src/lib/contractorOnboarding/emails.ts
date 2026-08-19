import { Resend } from "resend";

/**
 * Contractor-onboarding transactional emails.
 *
 * Design constraints (per audit + brief):
 *   * Never render W-9 / SSN / bank / signature values in email
 *     bodies or attach them. Completion mail carries a secure
 *     admin URL only.
 *   * Completion recipients are hardcoded to the three business
 *     leaders in the brief — do NOT fan out via DB role query.
 *   * Branded shell matches existing transactional style
 *     (Vending Connector green, Inter-ish, tight).
 */

const FROM = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";
const REPLY_TO = "anthony.heidal@apexaivending.com";

// Locked recipient list for completion notifications. Never source
// this from the DB — see brief + audit RISKS section.
export const CONTRACTOR_ONBOARDING_NOTIFY = [
  "james@apexaivending.com",
  "anthony.heidal@apexaivending.com",
  "bryan.rice@apexaivending.com",
] as const;

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.15em;color:#16A34A;text-transform:uppercase">
        Vending Connector · Apex AI Vending
      </div>
    </div>
    ${bodyHtml}
    <p style="color:#888;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;line-height:1.6">
      This message is from Vending Connector / Apex AI Vending LLP.<br>
      Questions? Reply to this email or contact <a href="mailto:${REPLY_TO}" style="color:#16A34A">${REPLY_TO}</a>.
    </p>
  </div>`;
}

// ─────────────────────────────────────────────────────────────
// Invitation to the contractor
// ─────────────────────────────────────────────────────────────

export async function sendContractorInvitationEmail(args: {
  toEmail: string;
  contractorName: string | null;
  startDate: string;          // ISO date
  onboardingUrl: string;      // absolute URL including raw token
}): Promise<void> {
  const startDateReadable = formatDate(args.startDate);
  const firstName = args.contractorName ? args.contractorName.split(" ")[0] : "there";

  const html = shell(`
    <h1 style="color:#16A34A;font-size:22px;margin:0 0 8px">Congratulations & Welcome!</h1>
    <p style="font-size:15px;line-height:1.55">Hi ${escape(firstName)},</p>
    <p style="font-size:15px;line-height:1.55">
      Congratulations! You've been selected as a <strong>Vice President</strong> with
      Vending Connector / Apex AI Vending LLP.
    </p>
    <p style="font-size:15px;line-height:1.55">
      Your start date is <strong>${escape(startDateReadable)}</strong>.
    </p>
    <p style="font-size:15px;line-height:1.55">
      Please complete your onboarding documents using the secure link below —
      contractor information, required agreements, compensation acknowledgment,
      tax documentation, and payment information — before your start date.
    </p>
    <p style="text-align:center;margin:28px 0">
      <a href="${args.onboardingUrl}"
         style="display:inline-block;background:#16A34A;color:#ffffff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">
        Complete My Onboarding →
      </a>
    </p>
    <p style="font-size:13px;color:#555;line-height:1.55">
      This link is secure and unique to you. It expires in 14 days — if it expires
      before you finish, reply to this email and we'll issue a new one.
    </p>
    <p style="font-size:15px;line-height:1.55;margin-top:24px">
      We're looking forward to working with you as we grow vending businesses around
      the world.
    </p>
    <p style="font-size:15px;line-height:1.55">
      Cheers,<br>
      <strong>Vending Connector / Apex AI Vending</strong>
    </p>
  `);

  await getResend().emails.send({
    from: FROM,
    to: args.toEmail,
    replyTo: REPLY_TO,
    subject: "Congratulations & Welcome to Vending Connector / Apex AI Vending",
    html,
  });
}

// ─────────────────────────────────────────────────────────────
// Completion notification — leadership only
// ─────────────────────────────────────────────────────────────

export async function sendContractorCompletionNotification(args: {
  contractorName: string;
  contractorEmail: string;
  startDate: string;         // ISO
  completedAt: string;       // ISO
  adminUrl: string;          // admin-authenticated view URL
}): Promise<void> {
  const html = shell(`
    <h1 style="color:#16A34A;font-size:22px;margin:0 0 8px">Contractor Onboarding Complete</h1>
    <p style="font-size:15px;line-height:1.55">
      <strong>${escape(args.contractorName)}</strong> has completed the Vending Connector /
      Apex AI Vending contractor onboarding process.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
      <tr>
        <td style="padding:8px 12px;font-weight:600;width:35%;background:#f9fafb">Contractor</td>
        <td style="padding:8px 12px">${escape(args.contractorName)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;background:#f9fafb">Email</td>
        <td style="padding:8px 12px">${escape(args.contractorEmail)}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;background:#f9fafb">Start Date</td>
        <td style="padding:8px 12px">${escape(formatDate(args.startDate))}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;background:#f9fafb">Completed</td>
        <td style="padding:8px 12px">${escape(formatDateTime(args.completedAt))}</td>
      </tr>
    </table>
    <p style="text-align:center;margin:28px 0">
      <a href="${args.adminUrl}"
         style="display:inline-block;background:#16A34A;color:#ffffff;padding:14px 28px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px">
        View Onboarding Packet →
      </a>
    </p>
    <p style="font-size:12px;color:#666;line-height:1.55;margin-top:16px;padding:12px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px">
      <strong>Security note:</strong> the signed packet is available securely in the
      CRM through the link above. Tax and banking information is NOT included in
      this email; sign in to view the restricted documents.
    </p>
  `);

  await Promise.all(
    CONTRACTOR_ONBOARDING_NOTIFY.map((to) =>
      getResend()
        .emails.send({
          from: FROM,
          to,
          replyTo: REPLY_TO,
          subject: `Contractor Onboarding Complete — ${args.contractorName}`,
          html,
        })
        .catch((err) => {
          console.error(`[contractor-onboarding] completion notify to ${to} failed:`, err);
        }),
    ),
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }) + " ET";
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
