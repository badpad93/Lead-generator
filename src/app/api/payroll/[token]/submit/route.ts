import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTokenLive, resolveRawPayrollToken } from "@/lib/payroll/tokenLookup";
import { sendPayrollAdminReviewEmail } from "@/lib/payroll/emails";

/**
 * POST /api/payroll/[token]/submit
 *
 * Finalizes the packet. Verifies required fields per classification,
 * flips status to admin_review_required, marks the invitation used
 * (so the token stops working), captures the electronic-signature
 * metadata (typed name, IP, UA), and fires the admin notification.
 *
 * Body: { signature_name: string, certified: boolean }
 */
export async function POST(
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
  const signatureName = typeof body?.signature_name === "string" ? body.signature_name.trim() : "";
  const certified = !!body?.certified;
  if (!signatureName) return NextResponse.json({ error: "Typed legal name is required." }, { status: 400 });
  if (!certified) {
    return NextResponse.json(
      { error: "You must certify that the information you provided is complete and accurate." },
      { status: 400 },
    );
  }

  const [{ data: profile }, { data: worker }, { data: encRows }] = await Promise.all([
    supabaseAdmin.from("payroll_profiles").select("*").eq("id", profileId).maybeSingle(),
    supabaseAdmin.from("payroll_worker_details").select("*").eq("profile_id", profileId).maybeSingle(),
    supabaseAdmin.from("payroll_encrypted").select("field_key").eq("profile_id", profileId),
  ]);
  if (!profile) return NextResponse.json({ error: "Invalid link." }, { status: 404 });

  const encKeys = new Set((encRows ?? []).map((r) => r.field_key as string));
  const missing: string[] = [];

  if (!worker?.legal_first_name) missing.push("Legal first name");
  if (!worker?.legal_last_name) missing.push("Legal last name");
  if (!worker?.address_street || !worker?.address_city || !worker?.address_state || !worker?.address_zip) {
    missing.push("Home address");
  }
  // Bank details are required for both W-2 and 1099 (direct deposit).
  if (!encKeys.has("bank.routing") || !encKeys.has("bank.account")) missing.push("Direct deposit account");
  if (!worker?.account_holder_name || !worker?.bank_name || !worker?.account_type) {
    missing.push("Bank name / account type");
  }

  if (profile.classification === "w2_employee") {
    if (!worker?.date_of_birth) missing.push("Date of birth");
    if (!encKeys.has("ssn")) missing.push("Social Security number");
    if (!worker?.filing_status) missing.push("Federal filing status");
  } else if (profile.classification === "1099_contractor") {
    if (!worker?.federal_tax_class) missing.push("Federal tax classification");
    if (!worker?.tin_type) missing.push("TIN type");
    if (!encKeys.has("tin")) missing.push("Taxpayer Identification Number");
  }

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Please complete the following before submitting: ${missing.join(", ")}.` },
      { status: 400 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const ua = req.headers.get("user-agent") || null;
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from("payroll_profiles")
    .update({
      status: "admin_review_required",
      submitted_at: nowIso,
      submission_signature_name: signatureName,
      submission_signature_at: nowIso,
      submission_ip: ip,
      submission_user_agent: ua,
      updated_at: nowIso,
    })
    .eq("id", profileId);

  // Mark invitation used — the URL stops working from this point.
  await supabaseAdmin
    .from("payroll_invitations")
    .update({ used_at: nowIso })
    .eq("id", resolved.invitation_id);

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: profileId,
    actor_kind: "employee",
    event_type: "submitted",
    description: `Employee submitted the packet (${profile.classification}).`,
    metadata: {
      signature_name: signatureName,
      ip: ip ?? undefined,
      user_agent: ua ?? undefined,
    },
  });

  // Admin notification — names + status only, no sensitive values.
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  try {
    await sendPayrollAdminReviewEmail({
      recipientName: [worker?.legal_first_name, worker?.legal_last_name].filter(Boolean).join(" ") || null,
      recipientEmail: profile.recipient_email ?? "",
      classification: profile.classification,
      reviewUrl: `${origin}/admin/payroll/${profileId}`,
    });
  } catch (mailErr) {
    console.error("[payroll.submit] admin notification failed:", mailErr);
  }

  return NextResponse.json({ ok: true });
}
