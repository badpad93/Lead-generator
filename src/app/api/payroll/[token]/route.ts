import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTokenLive, resolveRawPayrollToken } from "@/lib/payroll/tokenLookup";

/**
 * GET /api/payroll/[token]
 *
 * Public endpoint (URL IS the credential). Returns just enough for
 * the wizard to render — admin-set employment/comp info the worker
 * needs to see read-only + whatever draft they've saved so far.
 * NEVER returns encrypted field plaintext.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveRawPayrollToken(token);
  if (!resolved) return NextResponse.json({ error: "Invalid or expired link." }, { status: 404 });
  if (!isTokenLive(resolved)) {
    return NextResponse.json(
      {
        error:
          resolved.revoked_at ? "This invitation was revoked. Contact your manager for a new link."
            : resolved.used_at ? "This packet has already been submitted."
              : "This invitation has expired. Contact your manager for a new link.",
        state: resolved.revoked_at ? "revoked" : resolved.used_at ? "used" : "expired",
      },
      { status: 410 },
    );
  }

  // Mark first-open time on the invitation (once) so admins can see
  // the recipient engaged.
  await supabaseAdmin
    .from("payroll_invitations")
    .update({ opened_at: new Date().toISOString() })
    .eq("id", resolved.invitation_id)
    .is("opened_at", null);

  const [{ data: profile }, { data: worker }] = await Promise.all([
    supabaseAdmin.from("payroll_profiles").select("*").eq("id", resolved.profile_id).maybeSingle(),
    supabaseAdmin.from("payroll_worker_details").select("*").eq("profile_id", resolved.profile_id).maybeSingle(),
  ]);
  if (!profile) return NextResponse.json({ error: "Invalid link." }, { status: 404 });

  return NextResponse.json({
    ok: true,
    // Admin-set (read-only for worker)
    admin: {
      classification: profile.classification,
      job_title: profile.job_title,
      department: profile.department,
      hire_date: profile.hire_date,
      employment_status: profile.employment_status,
      pay_type: profile.pay_type,
      pay_frequency: profile.pay_frequency,
      company_entity: profile.company_entity,
      work_state: profile.work_state,
    },
    // Draft state (whatever they've saved so far)
    worker: worker ?? null,
    status: profile.status,
    // For any encrypted field they've already saved, expose ONLY the
    // key so the wizard shows "on file" instead of "not entered".
    // Plaintext never leaves the server here.
    saved_sensitive_keys: await savedEncryptedKeys(resolved.profile_id),
  });
}

async function savedEncryptedKeys(profileId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("payroll_encrypted")
    .select("field_key")
    .eq("profile_id", profileId);
  return (data ?? []).map((r) => r.field_key);
}
