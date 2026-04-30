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
    .select("*, onboarding_pipelines(id, role_type), onboarding_steps(id, step_key, order_index)")
    .eq("id", id)
    .single();

  if (cErr || !candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  const currentStatus = candidate.status;

  if (currentStatus === "pending_admin_review_1") {
    const { data: nextStep } = await supabaseAdmin
      .from("onboarding_steps")
      .select("id")
      .eq("pipeline_id", candidate.current_pipeline_id)
      .eq("step_key", "welcome_docs")
      .single();

    await supabaseAdmin
      .from("candidates")
      .update({
        status: "welcome_docs_sent",
        current_step_id: nextStep?.id || candidate.current_step_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Auto-send welcome docs with portal link if candidate has email
    let portalUrl: string | null = null;
    if (candidate.email) {
      try {
        const nextStepKey = "welcome_docs";
        const { data: assignments } = await supabaseAdmin
          .from("step_document_assignments")
          .select("id, required, document_templates(id, active)")
          .eq("pipeline_id", candidate.current_pipeline_id)
          .eq("step_key", nextStepKey);

        let requiredCount = (assignments || []).filter(
          (a: Record<string, unknown>) => {
            const tmpl = a.document_templates as Record<string, unknown> | null;
            return a.required && tmpl && tmpl.active && tmpl.form_enabled;
          }
        ).length;

        // Fallback: count form-enabled templates if no assignments
        if (requiredCount === 0) {
          const { count } = await supabaseAdmin
            .from("document_templates")
            .select("id", { count: "exact", head: true })
            .eq("step_key", nextStepKey)
            .eq("form_enabled", true)
            .eq("active", true);
          requiredCount = count || 0;
        }

        if (requiredCount > 0) {
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

          if (tokenRecord) {
            const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://vendingconnector.com";
            portalUrl = `${baseUrl}/onboarding/${tokenRecord.token}`;
          }

          await sendOnboardingDocsEmail({
            candidateId: id,
            candidateEmail: candidate.email,
            candidateName: candidate.full_name,
            stepKey: nextStepKey,
            pipelineId: candidate.current_pipeline_id,
            roleType: candidate.onboarding_pipelines?.role_type || candidate.role_type,
            portalUrl,
          });
        }
      } catch {
        // Don't block approval if email fails
      }
    }

    return NextResponse.json({ success: true, new_status: "welcome_docs_sent", portal_url: portalUrl });
  }

  if (currentStatus === "pending_admin_review_2") {
    const { data: finalStep } = await supabaseAdmin
      .from("onboarding_steps")
      .select("id")
      .eq("pipeline_id", candidate.current_pipeline_id)
      .eq("step_key", "completion")
      .single();

    await supabaseAdmin
      .from("candidates")
      .update({
        status: "completed",
        current_step_id: finalStep?.id || candidate.current_step_id,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // Send completion documents if any are mapped
    if (candidate.email) {
      try {
        const { data: resourceAssignments } = await supabaseAdmin
          .from("step_document_assignments")
          .select("*, document_templates(id, name, file_name, file_path, mime_type, active, form_enabled)")
          .eq("pipeline_id", candidate.current_pipeline_id)
          .eq("step_key", "completion");

        const resourceDocs = (resourceAssignments || []).filter((a: Record<string, unknown>) => {
          const tmpl = a.document_templates as Record<string, unknown> | null;
          return tmpl && tmpl.active;
        });

        if (resourceDocs.length > 0) {
          await sendOnboardingDocsEmail({
            candidateId: id,
            candidateEmail: candidate.email,
            candidateName: candidate.full_name,
            stepKey: "completion",
            pipelineId: candidate.current_pipeline_id,
            roleType: candidate.onboarding_pipelines?.role_type || candidate.role_type,
          });
        }
      } catch {
        // Don't block approval if email fails
      }
    }

    return NextResponse.json({ success: true, new_status: "completed" });
  }

  return NextResponse.json({ error: `Cannot approve candidate in status: ${currentStatus}` }, { status: 400 });
}
