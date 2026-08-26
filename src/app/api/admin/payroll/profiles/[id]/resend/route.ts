import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { generatePayrollToken } from "@/lib/payroll/token";
import { sendPayrollInvitationEmail } from "@/lib/payroll/emails";

/**
 * POST /api/admin/payroll/profiles/[id]/resend
 *
 * Admin-only. Issues a fresh token, marks any active older invites
 * revoked (so the previous URL stops working), and sends the
 * invitation email again to the profile's recipient_email.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { data: profile } = await supabaseAdmin
    .from("payroll_profiles")
    .select("id, classification, recipient_email, team_member_id, company_entity")
    .eq("id", id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: member } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", profile.team_member_id)
    .maybeSingle();

  const recipientEmail = (profile.recipient_email || "").trim();
  if (!recipientEmail) {
    return NextResponse.json({ error: "Recipient email is empty on this profile." }, { status: 400 });
  }

  // Revoke any still-active invites so the old URL stops working.
  await supabaseAdmin
    .from("payroll_invitations")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.id })
    .eq("profile_id", id)
    .is("revoked_at", null)
    .is("used_at", null);

  const { raw, hash, expiresAt } = generatePayrollToken();
  const nowIso = new Date().toISOString();
  await supabaseAdmin.from("payroll_invitations").insert({
    profile_id: id,
    token_hash: hash,
    expires_at: expiresAt,
    sent_at: nowIso,
    created_by: actor.id,
  });

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  try {
    await sendPayrollInvitationEmail({
      toEmail: recipientEmail,
      recipientName: member?.full_name ?? null,
      classification: profile.classification,
      packetUrl: `${origin}/payroll/${raw}`,
      companyName: profile.company_entity ?? null,
    });
  } catch (mailErr) {
    return NextResponse.json(
      { error: `Resend failed: ${mailErr instanceof Error ? mailErr.message : "unknown error"}` },
      { status: 502 },
    );
  }

  await supabaseAdmin
    .from("payroll_profiles")
    .update({ status: "invite_sent", updated_at: nowIso })
    .eq("id", id);

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: id,
    actor_user_id: actor.id,
    actor_kind: "admin",
    event_type: "invite.resent",
    description: `Invitation resent to ${recipientEmail}`,
  });

  return NextResponse.json({ ok: true });
}
