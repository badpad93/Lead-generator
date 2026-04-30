import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { sendOnboardingDocsEmail } from "@/lib/onboardingPipelineEmail";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from("candidates")
    .select("*, onboarding_pipelines(id, role_type), onboarding_steps(step_key)")
    .eq("id", id)
    .single();

  if (cErr || !candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  if (!candidate.email) {
    return NextResponse.json({ error: "Candidate has no email address" }, { status: 400 });
  }

  const stepKey = candidate.onboarding_steps?.step_key;
  if (!stepKey) {
    return NextResponse.json({ error: "Candidate must be added to a pipeline before sending documents. Use the arrow button to add them first." }, { status: 400 });
  }
  if (stepKey !== "interview" && stepKey !== "welcome_docs") {
    return NextResponse.json({ error: `Cannot send documents for step: ${stepKey}` }, { status: 400 });
  }

  // Check if docs were already sent for this step (prevent duplicate sends)
  const { data: existingToken } = await supabaseAdmin
    .from("candidate_tokens")
    .select("id")
    .eq("candidate_id", id)
    .eq("step_key", stepKey)
    .in("status", ["pending", "viewed"])
    .limit(1)
    .maybeSingle();

  if (existingToken) {
    return NextResponse.json({ error: "Documents have already been sent for this step" }, { status: 400 });
  }

  if (!candidate.full_name || !candidate.interview_date || !candidate.interview_time || !candidate.phone) {
    if (stepKey === "interview") {
      return NextResponse.json({ error: "Please complete all required fields (name, phone, interview date/time) before sending documents" }, { status: 400 });
    }
  }

  try {
    // Count required documents for this step
    const { data: assignments } = await supabaseAdmin
      .from("step_document_assignments")
      .select("id, required, document_templates(id, active)")
      .eq("pipeline_id", candidate.current_pipeline_id)
      .eq("step_key", stepKey);

    let requiredCount = (assignments || []).filter(
      (a: Record<string, unknown>) => {
        const tmpl = a.document_templates as Record<string, unknown> | null;
        return a.required && tmpl && tmpl.active;
      }
    ).length;

    // Fallback: count form-enabled templates for this step if no assignments
    if (requiredCount === 0) {
      const { count } = await supabaseAdmin
        .from("document_templates")
        .select("id", { count: "exact", head: true })
        .eq("step_key", stepKey)
        .eq("form_enabled", true)
        .eq("active", true);
      requiredCount = count || 0;
    }

    // Create a candidate token for the submission portal
    const { data: tokenRecord } = await supabaseAdmin
      .from("candidate_tokens")
      .insert({
        candidate_id: id,
        step_key: stepKey,
        pipeline_id: candidate.current_pipeline_id,
        required_doc_count: requiredCount,
      })
      .select("token")
      .single();

    let portalUrl: string | null = null;
    if (tokenRecord) {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://vendingconnector.com";
      portalUrl = `${baseUrl}/onboarding/${tokenRecord.token}`;
    }

    const result = await sendOnboardingDocsEmail({
      candidateId: id,
      candidateEmail: candidate.email,
      candidateName: candidate.full_name,
      stepKey,
      pipelineId: candidate.current_pipeline_id,
      roleType: candidate.onboarding_pipelines?.role_type || candidate.role_type,
      portalUrl,
    });

    return NextResponse.json({ ...result, portal_url: portalUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
