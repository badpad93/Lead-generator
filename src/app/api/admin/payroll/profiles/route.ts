import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { generatePayrollToken } from "@/lib/payroll/token";
import { sendPayrollInvitationEmail } from "@/lib/payroll/emails";
import type { PayrollClassification, PayrollStatus } from "@/lib/payroll/constants";

/**
 * GET  /api/admin/payroll/profiles — admin-only list + counts
 * POST /api/admin/payroll/profiles — admin-only. Body:
 *   {
 *     team_member_id, classification, job_title?, department?, manager_user_id?,
 *     work_location?, employment_status?, hire_date?,
 *     pay_type?, pay_frequency?, hourly_rate_cents?, annual_salary_cents?,
 *     commission_notes?, expected_hours_per_week?, overtime_eligible?,
 *     compensation_notes?, company_entity?, recipient_email?
 *   }
 * Creates the payroll_profiles row + issues an invitation token +
 * sends the "Complete Your Payroll Setup" email in one shot.
 */
export async function GET(req: NextRequest) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const memberIds = Array.from(new Set((data ?? []).map((p) => p.team_member_id).filter(Boolean)));
  const memberMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (memberIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", memberIds);
    for (const p of profs ?? []) {
      memberMap[p.id] = { full_name: p.full_name, email: p.email };
    }
  }

  const rows = (data ?? []).map((p) => ({
    ...p,
    team_member: memberMap[p.team_member_id] ?? null,
  }));

  // Simple status counts for the dashboard tiles.
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

  return NextResponse.json({ profiles: rows, counts });
}

export async function POST(req: NextRequest) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  const teamMemberId = typeof body?.team_member_id === "string" ? body.team_member_id : "";
  const classification = body?.classification as PayrollClassification | undefined;
  if (!teamMemberId) return NextResponse.json({ error: "team_member_id is required" }, { status: 400 });
  if (classification !== "w2_employee" && classification !== "1099_contractor") {
    return NextResponse.json({ error: "classification must be w2_employee or 1099_contractor" }, { status: 400 });
  }

  const { data: member } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", teamMemberId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Team member not found" }, { status: 404 });

  const recipientEmail = (typeof body?.recipient_email === "string" ? body.recipient_email : member.email ?? "").trim();
  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return NextResponse.json({ error: "A valid recipient email is required." }, { status: 400 });
  }

  // Upsert: one payroll_profiles row per team member. Re-inviting the
  // same member updates the record and issues a fresh token — the
  // uniqueness constraint on team_member_id enforces the one-row rule.
  const insertPayload: Record<string, unknown> = {
    team_member_id: teamMemberId,
    created_by_user_id: actor.id,
    classification,
    job_title: strOrNull(body.job_title),
    department: strOrNull(body.department),
    manager_user_id: strOrNull(body.manager_user_id),
    work_location: strOrNull(body.work_location),
    employment_status: strOrNull(body.employment_status),
    hire_date: strOrNull(body.hire_date),
    pay_type: strOrNull(body.pay_type),
    pay_frequency: strOrNull(body.pay_frequency),
    hourly_rate_cents: intOrNull(body.hourly_rate_cents),
    annual_salary_cents: intOrNull(body.annual_salary_cents),
    commission_notes: strOrNull(body.commission_notes),
    expected_hours_per_week: numOrNull(body.expected_hours_per_week),
    overtime_eligible: typeof body.overtime_eligible === "boolean" ? body.overtime_eligible : null,
    compensation_notes: strOrNull(body.compensation_notes),
    company_entity: strOrNull(body.company_entity),
    recipient_email: recipientEmail,
    work_state: strOrNull(body.work_state),
    status: "invite_sent" as PayrollStatus,
    updated_at: new Date().toISOString(),
  };

  const { data: profile, error: upsertErr } = await supabaseAdmin
    .from("payroll_profiles")
    .upsert(insertPayload, { onConflict: "team_member_id" })
    .select("*")
    .single();
  if (upsertErr || !profile) {
    return NextResponse.json({ error: upsertErr?.message ?? "Failed to create payroll profile" }, { status: 500 });
  }

  // Issue token + send email.
  const { raw, hash, expiresAt } = generatePayrollToken();
  const { error: inviteErr } = await supabaseAdmin
    .from("payroll_invitations")
    .insert({
      profile_id: profile.id,
      token_hash: hash,
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
      created_by: actor.id,
    });
  if (inviteErr) {
    return NextResponse.json({ error: `Invitation persist failed: ${inviteErr.message}` }, { status: 500 });
  }

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const packetUrl = `${origin}/payroll/${raw}`;

  try {
    await sendPayrollInvitationEmail({
      toEmail: recipientEmail,
      recipientName: member.full_name,
      classification,
      packetUrl,
      companyName: typeof body.company_entity === "string" ? body.company_entity : null,
    });
  } catch (mailErr) {
    // Roll status back so admin can retry via resend without losing the record.
    await supabaseAdmin
      .from("payroll_profiles")
      .update({ status: "invite_ready" })
      .eq("id", profile.id);
    return NextResponse.json(
      {
        error: `Payroll profile saved but the invitation email failed to send: ${mailErr instanceof Error ? mailErr.message : "unknown error"}. Use Resend to retry.`,
        profile_id: profile.id,
      },
      { status: 502 },
    );
  }

  // Audit — never carries body values.
  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: profile.id,
    actor_user_id: actor.id,
    actor_kind: "admin",
    event_type: "invite.sent",
    description: `Invitation sent to ${recipientEmail}`,
    metadata: { classification, expires_at: expiresAt },
  });

  return NextResponse.json({ ok: true, profile_id: profile.id, status: profile.status });
}

function strOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}
function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
