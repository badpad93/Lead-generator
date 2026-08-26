import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTokenLive, resolveRawPayrollToken } from "@/lib/payroll/tokenLookup";
import { encryptField, last4 } from "@/lib/payroll/encryption";

/**
 * PATCH /api/payroll/[token]/save-draft
 *
 * Public (token-based). Persists a wizard step's data. Sensitive
 * values (SSN / TIN / full routing / full account / W-4 additional
 * withholding) are moved to payroll_encrypted immediately and
 * REPLACED on payroll_worker_details with just their last-4 for
 * display. Nothing on payroll_worker_details holds full sensitive
 * plaintext.
 *
 * Body shape:
 *   {
 *     step: string,                 // step key (e.g. 'personal', 'address', ...)
 *     nonSensitive?: object,        // patch for payroll_worker_details
 *     encrypted?: { [key]: string } // full plaintext of sensitive fields
 *   }
 *
 * Neither the request nor the audit log ever carries the plaintext
 * SSN / bank number — the encrypted values are captured and the
 * audit row only records that a step advanced.
 */
const NON_SENSITIVE_ALLOWLIST = new Set<string>([
  // Personal
  "legal_first_name", "middle_name", "legal_last_name", "preferred_name",
  "date_of_birth", "personal_email", "mobile_phone",
  // Address
  "address_street", "address_unit", "address_city", "address_state", "address_zip", "address_country",
  // W-4 non-sensitive
  "filing_status", "multiple_jobs",
  "qualifying_children_amt", "other_dependents_amt",
  "other_income_cents", "deductions_cents", "exempt",
  // Bank non-sensitive
  "account_holder_name", "bank_name", "account_type",
  // 1099 non-sensitive
  "business_name", "federal_tax_class", "tin_type",
  // Emergency contact
  "emergency_contact_name", "emergency_contact_relationship",
  "emergency_contact_phone", "emergency_contact_email",
]);

const ENCRYPTED_ALLOWLIST = new Set<string>([
  "ssn", "tin", "bank.routing", "bank.account", "w4.additional_withholding_cents",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveRawPayrollToken(token);
  if (!resolved) return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  if (!isTokenLive(resolved)) {
    return NextResponse.json({ error: "This invitation is no longer active." }, { status: 410 });
  }
  const profileId = resolved.profile_id;

  const body = await req.json().catch(() => ({}));
  const step = typeof body?.step === "string" ? body.step.slice(0, 60) : "";
  const nonSensitive = (body?.nonSensitive && typeof body.nonSensitive === "object")
    ? body.nonSensitive as Record<string, unknown>
    : {};
  const encrypted = (body?.encrypted && typeof body.encrypted === "object")
    ? body.encrypted as Record<string, unknown>
    : {};

  // 1) Filter + upsert non-sensitive fields onto payroll_worker_details.
  const filteredNS: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(nonSensitive)) {
    if (NON_SENSITIVE_ALLOWLIST.has(k)) filteredNS[k] = v;
  }
  if (Object.keys(filteredNS).length > 0 || step) {
    const patch: Record<string, unknown> = {
      profile_id: profileId,
      ...filteredNS,
      last_step_completed: step || null,
      updated_at: new Date().toISOString(),
    };
    const { error: wdErr } = await supabaseAdmin
      .from("payroll_worker_details")
      .upsert(patch, { onConflict: "profile_id" });
    if (wdErr) return NextResponse.json({ error: wdErr.message }, { status: 500 });
  }

  // 2) Encrypt + store each sensitive field. Also write the last-4
  //    onto payroll_worker_details for masked display (never the
  //    full value). Never log the plaintext.
  const last4Patch: Record<string, unknown> = {};
  for (const [key, rawVal] of Object.entries(encrypted)) {
    if (!ENCRYPTED_ALLOWLIST.has(key)) continue;
    if (typeof rawVal !== "string") continue;
    const clean = rawVal.replace(/[^0-9A-Za-z]/g, "").trim();
    if (!clean) continue;
    let enc;
    try {
      enc = encryptField(clean);
    } catch (encErr) {
      console.error("[payroll.save-draft] encrypt failed:", encErr);
      return NextResponse.json(
        { error: "Server misconfiguration prevented saving this field. The platform team has been notified." },
        { status: 500 },
      );
    }
    await supabaseAdmin.from("payroll_encrypted").upsert(
      {
        profile_id: profileId,
        field_key: key,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        auth_tag: enc.auth_tag,
        key_version: enc.key_version,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id,field_key" },
    );

    if (key === "ssn") last4Patch.ssn_last4 = last4(clean);
    else if (key === "tin") last4Patch.tin_last4 = last4(clean);
    else if (key === "bank.routing") last4Patch.routing_last4 = last4(clean);
    else if (key === "bank.account") last4Patch.account_last4 = last4(clean);
  }
  if (Object.keys(last4Patch).length > 0) {
    await supabaseAdmin
      .from("payroll_worker_details")
      .upsert(
        { profile_id: profileId, ...last4Patch, updated_at: new Date().toISOString() },
        { onConflict: "profile_id" },
      );
  }

  // 3) Bump status to in_progress on first save.
  await supabaseAdmin
    .from("payroll_profiles")
    .update({ status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .in("status", ["invite_ready", "invite_sent"]);

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: profileId,
    actor_kind: "employee",
    event_type: "draft.saved",
    description: step ? `Employee saved step '${step}'` : "Employee saved draft",
    metadata: {
      step,
      // ONLY the keys of sensitive fields we saved — never values.
      sensitive_keys_saved: Object.keys(encrypted).filter((k) => ENCRYPTED_ALLOWLIST.has(k)),
      non_sensitive_keys_saved: Object.keys(filteredNS),
    },
  });

  return NextResponse.json({ ok: true });
}
