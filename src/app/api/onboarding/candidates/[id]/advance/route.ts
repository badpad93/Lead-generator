import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { sendOnboardingDocsEmail } from "@/lib/onboardingPipelineEmail";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from("candidates")
    .select("*, onboarding_pipelines(id, role_type), onboarding_steps(step_key)")
    .eq("id", id)
    .single();

  if (cErr || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  if (candidate.status !== "interview" && candidate.status !== "interview_complete") {
    return NextResponse.json({ error: `Cannot advance from status: ${candidate.status}` }, { status: 400 });
  }

  if (!candidate.email) {
    return NextResponse.json({ error: "Candidate has no email address" }, { status: 400 });
  }

  const { data: nextStep } = await supabaseAdmin
    .from("onboarding_steps")
    .select("id")
    .eq("pipeline_id", candidate.current_pipeline_id)
    .eq("step_key", "welcome_docs")
    .single();

  const nextStepKey = "welcome_docs";

  // Count required docs for welcome_docs step
  const { data: assignments } = await supabaseAdmin
    .from("step_document_assignments")
    .select("id, required, document_templates(id, active, form_enabled)")
    .eq("pipeline_id", candidate.current_pipeline_id)
    .eq("step_key", nextStepKey);

  let requiredCount = (assignments || []).filter(
    (a: Record<string, unknown>) => {
      const tmpl = a.document_templates as Record<string, unknown> | null;
      return a.required && tmpl && tmpl.active && tmpl.form_enabled;
    }
  ).length;

  if (requiredCount === 0) {
    const allForm = (assignments || []).filter(
      (a: Record<string, unknown>) => {
        const tmpl = a.document_templates as Record<string, unknown> | null;
        return tmpl && tmpl.active && tmpl.form_enabled;
      }
    ).length;
    if (allForm > 0) {
      requiredCount = allForm;
    } else {
      const { count } = await supabaseAdmin
        .from("document_templates")
        .select("id", { count: "exact", head: true })
        .eq("step_key", nextStepKey)
        .eq("form_enabled", true)
        .eq("active", true);
      requiredCount = count || 0;
    }
  }

  // Create candidate token for the portal
  const { data: tokenRecord } = await supabaseAdmin
    .from("candidate_tokens")
    .insert({
      candidate_id: id,
      step_key: nextStepKey,
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

  // Send welcome docs email
  const result = await sendOnboardingDocsEmail({
    candidateId: id,
    candidateEmail: candidate.email,
    candidateName: candidate.full_name,
    stepKey: nextStepKey,
    pipelineId: candidate.current_pipeline_id,
    roleType: candidate.onboarding_pipelines?.role_type || candidate.role_type,
    portalUrl,
  });

  // Advance status to welcome_docs_sent
  await supabaseAdmin
    .from("candidates")
    .update({
      status: "welcome_docs_sent",
      current_step_id: nextStep?.id || candidate.current_step_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({
    success: true,
    new_status: "welcome_docs_sent",
    portal_url: portalUrl,
    attachmentCount: result.attachmentCount,
  });
}
