import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { last4, maskBankAccount, maskSsn, maskTin } from "@/lib/payroll/encryption";

/**
 * GET /api/admin/payroll/profiles/[id]
 *
 * Admin-only. Returns the payroll profile + worker details + audit
 * events + a MASKED view of every encrypted field (last-4 only).
 * Full plaintext lives behind /reveal — a separate endpoint that
 * audit-logs each access.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { data: profile, error } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: worker } = await supabaseAdmin
    .from("payroll_worker_details")
    .select("*")
    .eq("profile_id", id)
    .maybeSingle();

  const { data: member } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", profile.team_member_id)
    .maybeSingle();

  const { data: invitations } = await supabaseAdmin
    .from("payroll_invitations")
    .select("id, sent_at, opened_at, used_at, revoked_at, expires_at, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false });

  const { data: audit } = await supabaseAdmin
    .from("payroll_audit_events")
    .select("id, actor_kind, event_type, description, metadata, created_at")
    .eq("profile_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Masked encrypted-field view — no ciphertext or plaintext leaves
  // the server here. UI reads `last4` + label.
  const { data: encrypted } = await supabaseAdmin
    .from("payroll_encrypted")
    .select("field_key, updated_at")
    .eq("profile_id", id);

  // Derive masked display strings from the *_last4 columns on
  // payroll_worker_details (populated on save so this endpoint never
  // has to decrypt).
  const masked: Record<string, string | null> = {};
  if (worker?.account_last4) masked["bank.account"] = maskBankAccount(worker.account_last4);
  if (worker?.routing_last4) masked["bank.routing"] = `••••${last4(worker.routing_last4)}`;
  if (worker?.tin_type && (worker as { tin_last4?: string | null }).tin_last4) {
    masked.tin = maskTin(
      (worker as { tin_last4?: string | null }).tin_last4 ?? "",
      (worker.tin_type as "ssn" | "ein") ?? null,
    );
  }
  if ((worker as { ssn_last4?: string | null } | null)?.ssn_last4) {
    masked.ssn = maskSsn((worker as { ssn_last4?: string | null }).ssn_last4 ?? "");
  }

  return NextResponse.json({
    profile,
    worker,
    team_member: member,
    invitations: invitations ?? [],
    audit: audit ?? [],
    encrypted_field_keys: (encrypted ?? []).map((e) => e.field_key),
    masked_display: masked,
  });
}

/**
 * PATCH /api/admin/payroll/profiles/[id]
 *
 * Admin-only. Updates a small allowlist of admin-controlled fields.
 * WORKER-owned fields (name/SSN/address/tax/bank) are NOT settable
 * here — those flow through the /payroll/[token] portal only.
 */
const ADMIN_EDITABLE_KEYS = new Set<string>([
  "job_title", "department", "manager_user_id", "work_location", "employment_status",
  "hire_date", "pay_type", "pay_frequency", "hourly_rate_cents", "annual_salary_cents",
  "commission_notes", "expected_hours_per_week", "overtime_eligible", "compensation_notes",
  "company_entity", "recipient_email", "work_state", "i9_status",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ADMIN_EDITABLE_KEYS.has(k)) updates[k] = v;
  }
  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: "No editable fields supplied." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("payroll_profiles").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: id,
    actor_user_id: actor.id,
    actor_kind: "admin",
    event_type: "admin.updated",
    description: "Admin updated payroll profile fields",
    metadata: { keys: Object.keys(updates).filter((k) => k !== "updated_at") },
  });

  return NextResponse.json({ ok: true });
}
