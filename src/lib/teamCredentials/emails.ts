import { Resend } from "resend";

/**
 * Send Credentials — transactional email builder + sender.
 *
 * Security notes
 *   * Passwords appear only inside the immediate email body render
 *     and the outbound Resend payload. They are never logged,
 *     persisted, or exposed to the caller after send.
 *   * Every string that ends up in HTML is HTML-escaped so passwords
 *     containing < > & " ' don't produce broken markup or accidental
 *     injection.
 *   * The renderer is exported so the admin can preview the exact
 *     body that will be sent — same code path.
 */

const FROM = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";
const REPLY_TO = process.env.CREDENTIALS_REPLY_TO || "james@apexaivending.com";

let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");
    _resend = new Resend(key);
  }
  return _resend;
}

export interface CredentialRow {
  system_name: string;
  login_url?: string | null;
  username: string;
  password: string;
}

export function isValidHttpUrl(u: string | null | undefined): boolean {
  if (!u) return true; // empty/null is allowed
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// Minimal HTML escape — passwords may contain <, >, &, ", ' and we
// must not break the markup or leak markup into the rendered value.
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameFromFull(full: string | null | undefined): string {
  if (!full) return "there";
  const cut = full.trim().split(/\s+/)[0];
  return cut || "there";
}

/**
 * Renders the full HTML body an admin will see in Preview and the
 * team member will receive. Kept pure so it's safe to call from both
 * the send route and the client-side preview (client re-implements
 * the render for local preview; keeping this exported keeps the
 * shape in one place for the server-authoritative send).
 */
export function renderCredentialsEmailHtml(args: {
  recipient_name: string | null;
  credentials: CredentialRow[];
}): string {
  const first = firstNameFromFull(args.recipient_name);

  const credentialSections = args.credentials
    .map((c) => {
      const url = c.login_url && c.login_url.trim()
        ? `<div style="margin:6px 0"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Login</span><br><a href="${esc(c.login_url)}" style="color:#16A34A;word-break:break-all">${esc(c.login_url)}</a></div>`
        : "";
      return `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0">
          <div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px">${esc(c.system_name)}</div>
          ${url}
          <div style="margin:6px 0"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Username</span><br><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111827">${esc(c.username)}</span></div>
          <div style="margin:6px 0"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Password</span><br><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111827">${esc(c.password)}</span></div>
        </div>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111">
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.15em;color:#16A34A;text-transform:uppercase">
        Vending Connector · Apex AI Vending
      </div>
    </div>
    <h1 style="font-size:22px;font-weight:700;color:#0A0A0A;margin:0 0 12px">Welcome to the team, ${esc(first)} 👋</h1>
    <p style="line-height:1.6;color:#374151;margin:0 0 12px">
      Congratulations again on your new journey with Vending Connector / Apex AI Vending — we're excited to have you on board.
    </p>
    <p style="line-height:1.6;color:#374151;margin:0 0 16px">
      To get started, please use the links and login credentials below to access the systems you'll need for your role.
    </p>

    ${credentialSections}

    <p style="line-height:1.6;color:#374151;margin:20px 0 12px">
      You will also need to check your email for information regarding your <strong>training session</strong>.
    </p>
    <p style="line-height:1.6;color:#374151;margin:0 0 12px">
      Please make sure you can successfully access each of the systems above before your training session. If you experience any issues logging in, let your manager know.
    </p>
    <p style="line-height:1.6;color:#374151;margin:20px 0 0">
      Looking forward to working with you and helping you get started.<br><br>
      — The Vending Connector / Apex AI Vending Team
    </p>

    <p style="color:#888;font-size:11px;margin-top:32px;border-top:1px solid #eee;padding-top:12px;line-height:1.6">
      This message is from Vending Connector / Apex AI Vending LLP.<br>
      Questions? Reply to this email or contact <a href="mailto:${esc(REPLY_TO)}" style="color:#16A34A">${esc(REPLY_TO)}</a>.
    </p>
  </div>`;
}

/**
 * Send the credentials email via Resend. Throws on failure so the
 * calling route can surface an actionable error to the admin.
 * NEVER logs the credentials.
 */
export async function sendCredentialsEmail(args: {
  toEmail: string;
  recipient_name: string | null;
  credentials: CredentialRow[];
}): Promise<{ id: string | null }> {
  const html = renderCredentialsEmailHtml({
    recipient_name: args.recipient_name,
    credentials: args.credentials,
  });

  const result = await getResend().emails.send({
    from: FROM,
    to: [args.toEmail],
    replyTo: REPLY_TO,
    subject: "Welcome to Vending Connector / Apex AI Vending — Your Login Credentials",
    html,
  });

  if (result.error) {
    // Do NOT include the request body in the error — passwords must
    // not surface in logs or error-reporting sinks.
    throw new Error(`Resend rejected credentials email: ${result.error.message}`);
  }
  return { id: result.data?.id ?? null };
}
