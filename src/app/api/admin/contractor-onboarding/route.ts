import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { generateOnboardingToken } from "@/lib/contractorOnboarding/token";
import { sendContractorInvitationEmail } from "@/lib/contractorOnboarding/emails";
import { AGREEMENT_VERSION } from "@/lib/contractorOnboarding/legal";

/**
 * Admin surface for contractor onboarding.
 *
 * Permission model:
 *   - Initiate + list: admin | director_of_sales | market_leader | sales_manager
 *   - View restricted documents: elevated roles only (enforced on
 *     the download endpoints, not here)
 *
 * POST creates a new onboarding record + issues a hashed token +
 * sends the branded invitation. GET returns a list scoped to the
 * user's role.
 */

const INITIATOR_ROLES = new Set([
  "admin",
  "director_of_sales",
  "market_leader",
  "sales_manager",
]);

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!INITIATOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("contractor_onboarding")
    .select(
      "id, team_member_id, contractor_name, contractor_email, start_date, status, sent_at, first_opened_at, completed_at, locked, send_count, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ onboardings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!INITIATOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const startDate = typeof body.start_date === "string" ? body.start_date.trim() : "";
  const name = typeof body.contractor_name === "string" ? body.contractor_name.trim() : "";
  const teamMemberId = typeof body.team_member_id === "string" ? body.team_member_id : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid contractor email is required" }, { status: 400 });
  }
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return NextResponse.json({ error: "Start date is required (YYYY-MM-DD)" }, { status: 400 });
  }

  // Guard against duplicate active invitations for the same email.
  // If one exists (not completed, not revoked, not expired), refuse
  // and surface the existing record's id so the UI can offer resend.
  const { data: existing } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("id, status")
    .ilike("contractor_email", email)
    .in("status", ["sent", "opened", "in_progress"])
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      {
        error: "An active onboarding invitation already exists for this email.",
        existing_id: existing.id,
        existing_status: existing.status,
      },
      { status: 409 },
    );
  }

  const { raw, hash, expiresAt } = generateOnboardingToken();
  const nowIso = new Date().toISOString();

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("contractor_onboarding")
    .insert({
      team_member_id: teamMemberId,
      contractor_email: email,
      contractor_name: name || null,
      start_date: startDate,
      status: "sent",
      token_hash: hash,
      token_created_at: nowIso,
      token_expires_at: expiresAt,
      agreement_version: AGREEMENT_VERSION,
      sent_at: nowIso,
      send_count: 1,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Failed to create onboarding record" },
      { status: 500 },
    );
  }

  const onboardingId = inserted.id as string;
  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://vendingconnector.com";
  const onboardingUrl = `${origin}/onboarding/${raw}`;

  // Send the invitation. If Resend fails we DON'T mark as sent — the
  // audit RISKS section flagged that sends can silently fail today.
  try {
    await sendContractorInvitationEmail({
      toEmail: email,
      contractorName: name || null,
      startDate,
      onboardingUrl,
    });
  } catch (mailErr) {
    console.error("[contractor-onboarding] invitation send failed:", mailErr);
    // Roll status back so admin can retry via resend.
    await supabaseAdmin
      .from("contractor_onboarding")
      .update({ status: "needs_attention", sent_at: null })
      .eq("id", onboardingId);
    return NextResponse.json(
      {
        error:
          "Onboarding record created but the invitation email failed to send. Use Resend to retry.",
        onboarding_id: onboardingId,
      },
      { status: 502 },
    );
  }

  // Universal audit log entry — reuse existing audit_logs table.
  // Non-fatal — the onboarding record itself is source of truth for
  // status; audit_logs is nice-to-have.
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: "contractor_onboarding_invitation_sent",
      entity_type: "contractor_onboarding",
      entity_id: onboardingId,
      metadata: { contractor_email: email, start_date: startDate },
    });
  } catch (auditErr) {
    console.error("[contractor-onboarding] audit log insert failed:", auditErr);
  }

  return NextResponse.json({
    onboarding_id: onboardingId,
    status: "sent",
    expires_at: expiresAt,
  });
}
