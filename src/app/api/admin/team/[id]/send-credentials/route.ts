import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  isValidHttpUrl,
  sendCredentialsEmail,
  type CredentialRow,
} from "@/lib/teamCredentials/emails";

/**
 * POST /api/admin/team/[id]/send-credentials
 *   Body: {
 *     recipient_email?: string,   // defaults to team member's profile email
 *     credentials: CredentialRow[]
 *   }
 *
 * Admin-only. Sends a branded onboarding-credentials email to the
 * named team member's email address and writes a NON-SENSITIVE
 * audit row (recipient, sender, timestamp, system names — never
 * passwords or usernames).
 *
 * Security notes
 *   - The request body carries plaintext passwords; the handler
 *     intentionally does NOT console.log the body, and the audit
 *     row it writes stores only the system-name array.
 *   - Auth is enforced server-side via getAdminUserId — hiding the
 *     button in the UI is not sufficient (per spec §9).
 *   - Duplicated log statements below deliberately omit the
 *     credentials arg to keep passwords off every logging sink.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Same auth path as the Team page uses (getSalesUser), then gate
  // on role === "admin". Keeps the button-shows-vs-API-accepts
  // decision in one place — /api/sales/users is authoritative for
  // the CRM view of who is admin.
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const adminId = actor.id;

  const { id: teamMemberId } = await params;
  if (!teamMemberId) {
    return NextResponse.json({ error: "Team member id required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const recipientOverride = typeof body?.recipient_email === "string"
    ? body.recipient_email.trim()
    : "";
  const credsRaw = Array.isArray(body?.credentials) ? body.credentials : [];

  // Look up the team member — need their name + fallback email.
  const { data: member, error: memberErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  const recipientEmail = recipientOverride || member.email || "";
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json(
      { error: "A valid recipient email is required." },
      { status: 400 },
    );
  }

  // Normalize + validate each credential row. Reject empty rows and
  // any obviously malformed URL. Trims but does not modify passwords.
  const credentials: CredentialRow[] = [];
  const systemNames: string[] = [];
  for (const raw of credsRaw) {
    const systemName = typeof raw?.system_name === "string" ? raw.system_name.trim() : "";
    const loginUrl = typeof raw?.login_url === "string" ? raw.login_url.trim() : "";
    const username = typeof raw?.username === "string" ? raw.username.trim() : "";
    // Password kept as-is — trailing/leading spaces are allowed and
    // could be intentional.
    const password = typeof raw?.password === "string" ? raw.password : "";
    if (!systemName || !username || !password) continue;
    if (loginUrl && !isValidHttpUrl(loginUrl)) {
      return NextResponse.json(
        { error: `Invalid login URL for "${systemName}". Must start with http:// or https://.` },
        { status: 400 },
      );
    }
    credentials.push({
      system_name: systemName,
      login_url: loginUrl || null,
      username,
      password,
    });
    systemNames.push(systemName);
  }

  if (credentials.length === 0) {
    return NextResponse.json(
      { error: "Add at least one credential (system name, username, and password all required)." },
      { status: 400 },
    );
  }

  // Send first, audit after — status reflects reality.
  try {
    await sendCredentialsEmail({
      toEmail: recipientEmail,
      recipient_name: member.full_name,
      credentials,
    });
  } catch (mailErr) {
    // Audit the failure so admins have a paper trail of attempts.
    // The error message from Resend is non-sensitive (SDK error
    // codes, throttle/reject reasons) but we defensively cap length.
    const msg = mailErr instanceof Error ? mailErr.message.slice(0, 500) : "Send failed";
    await supabaseAdmin.from("team_credential_email_sends").insert({
      team_member_id: teamMemberId,
      recipient_email: recipientEmail,
      sent_by_user_id: adminId,
      system_names: systemNames,
      send_status: "failed",
      error_message: msg,
    });
    // Bare log — no body, no credentials.
    console.error("[send-credentials] delivery failed:", { teamMemberId, recipientEmail, msg });
    return NextResponse.json(
      { error: "Unable to send credentials. Please verify the email address or try again." },
      { status: 502 },
    );
  }

  const { error: auditErr } = await supabaseAdmin
    .from("team_credential_email_sends")
    .insert({
      team_member_id: teamMemberId,
      recipient_email: recipientEmail,
      sent_by_user_id: adminId,
      system_names: systemNames,
      send_status: "sent",
    });
  if (auditErr) {
    // Send succeeded, audit failed — return success with a warning
    // so the admin knows to look at logs, but never fail the
    // response (the email is already out the door).
    console.error("[send-credentials] audit write failed:", auditErr.message);
  }

  return NextResponse.json({
    ok: true,
    sent_to: recipientEmail,
    team_member: { id: member.id, full_name: member.full_name },
    system_names: systemNames,
  });
}
