import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { generateOnboardingToken } from "@/lib/contractorOnboarding/token";
import { sendContractorInvitationEmail } from "@/lib/contractorOnboarding/emails";

/**
 * POST /api/admin/contractor-onboarding/[id]/regenerate
 *
 * Rotates the onboarding token and returns the new raw URL. Because
 * we store SHA-256(token) and not the token itself, we can never
 * "recover" a previously issued link — every request that needs to
 * hand the contractor a URL again generates a fresh one and
 * invalidates the old one.
 *
 * Body flags:
 *   - send:  boolean (default false) — also email the new URL
 *
 * Behavior maps to the admin buttons:
 *   Copy Secure Link  →  { send: false }  — returns { url }
 *   Resend Invitation →  { send: true }   — emails + returns { url }
 *
 * Refuses if the packet is already completed / revoked. Only
 * initiator roles can call this.
 */

const INITIATOR_ROLES = new Set(["admin", "director_of_sales", "market_leader", "sales_manager"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!INITIATOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const shouldSend = body.send === true;

  const { data: row } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("id, contractor_email, contractor_name, start_date, status, send_count")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.status === "completed") {
    return NextResponse.json({ error: "Packet already completed." }, { status: 409 });
  }
  if (row.status === "revoked") {
    return NextResponse.json({ error: "Invitation revoked. Reopen instead." }, { status: 409 });
  }

  const { raw, hash, expiresAt } = generateOnboardingToken();
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    token_hash: hash,
    token_created_at: nowIso,
    token_expires_at: expiresAt,
    updated_at: nowIso,
    status: "sent",
    last_resent_at: nowIso,
    last_resent_by: user.id,
    send_count: (row.send_count ?? 0) + (shouldSend ? 1 : 0),
    sent_at: shouldSend ? nowIso : row.status === "sent" ? undefined : nowIso,
  };

  const { error: updateErr } = await supabaseAdmin
    .from("contractor_onboarding")
    .update(patch)
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const origin =
    req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const url = `${origin}/onboarding/${raw}`;

  if (shouldSend) {
    try {
      await sendContractorInvitationEmail({
        toEmail: row.contractor_email,
        contractorName: row.contractor_name,
        startDate: row.start_date,
        onboardingUrl: url,
      });
    } catch (mailErr) {
      console.error("[contractor-onboarding/regenerate] resend failed:", mailErr);
      // The token has been rotated regardless; caller should retry the
      // send action. Report the failure so the admin knows.
      return NextResponse.json(
        { url, expires_at: expiresAt, email_failed: true, error: "Email send failed — link was regenerated." },
        { status: 502 },
      );
    }
  }

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: shouldSend ? "contractor_onboarding_invitation_resent" : "contractor_onboarding_link_copied",
      entity_type: "contractor_onboarding",
      entity_id: id,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ url, expires_at: expiresAt, sent: shouldSend });
}
