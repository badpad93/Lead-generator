import { supabaseAdmin } from "./supabaseAdmin";
import { sendOnboardingDocsEmail } from "./onboardingPipelineEmail";
import { sendCompletionNotification } from "./onboardingNotificationEmail";

interface AdvanceResult {
  allComplete: boolean;
  advanced: boolean;
  newStatus: string | null;
  nextTokenUrl: string | null;
}

/**
 * Check if all required documents for a candidate token have been submitted.
 * If yes, auto-advance the candidate to the next step and send the next batch of docs.
 */
export async function checkAndAdvanceCandidate(tokenId: string): Promise<AdvanceResult> {
  const { data: ct } = await supabaseAdmin
    .from("candidate_tokens")
    .select("*, candidates(id, full_name, email, role_type, status, current_pipeline_id, current_step_id)")
    .eq("id", tokenId)
    .single();

  if (!ct || !ct.candidates) {
    return { allComplete: false, advanced: false, newStatus: null, nextTokenUrl: null };
  }

  const candidate = ct.candidates as {
    id: string;
    full_name: string;
    email: string;
    role_type: string;
    status: string;
    current_pipeline_id: string;
    current_step_id: string;
  };

  // Get required document assignments for this step
  const { data: assignments } = await supabaseAdmin
    .from("step_document_assignments")
    .select("*, document_templates(id, active)")
    .eq("pipeline_id", ct.pipeline_id)
    .eq("step_key", ct.step_key);

  let requiredTemplateIds = (assignments || [])
    .filter((a: Record<string, unknown>) => {
      const tmpl = a.document_templates as Record<string, unknown> | null;
      return a.required && tmpl && tmpl.active;
    })
    .map((a: Record<string, unknown>) => (a.document_templates as Record<string, unknown>).id as string);

  // Fallback: if no assignments, use form-enabled templates for this step
  if (requiredTemplateIds.length === 0) {
    const { data: formTemplates } = await supabaseAdmin
      .from("document_templates")
      .select("id")
      .eq("step_key", ct.step_key)
      .eq("form_enabled", true)
      .eq("active", true);

    requiredTemplateIds = (formTemplates || []).map((t: { id: string }) => t.id);
  }

  // Get uploaded docs for this token
  const { data: uploaded } = await supabaseAdmin
    .from("candidate_documents")
    .select("document_template_id")
    .eq("candidate_token_id", ct.id)
    .eq("completed", true);

  const uploadedTemplateIds = new Set((uploaded || []).map((u: Record<string, unknown>) => u.document_template_id));
  const allComplete = requiredTemplateIds.every((id: string) => uploadedTemplateIds.has(id));

  if (!allComplete) {
    return { allComplete: false, advanced: false, newStatus: null, nextTokenUrl: null };
  }

  // Mark token as submitted
  await supabaseAdmin
    .from("candidate_tokens")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_doc_count: uploadedTemplateIds.size,
    })
    .eq("id", ct.id);

  // Determine next status based on current step
  const stepKey = ct.step_key;
  let newStatus: string;
  let nextStepKey: string | null = null;

  if (stepKey === "interview") {
    // All interview docs submitted → move to welcome_docs
    newStatus = "welcome_docs_sent";
    nextStepKey = "welcome_docs";
  } else if (stepKey === "welcome_docs") {
    // All welcome docs submitted → completed
    newStatus = "completed";
    nextStepKey = null;
  } else {
    return { allComplete: true, advanced: false, newStatus: null, nextTokenUrl: null };
  }

  // Get next step ID
  let nextStepId = candidate.current_step_id;
  const targetStepKey = newStatus === "completed" ? "completion" : nextStepKey;
  if (targetStepKey) {
    const { data: nextStep } = await supabaseAdmin
      .from("onboarding_steps")
      .select("id")
      .eq("pipeline_id", candidate.current_pipeline_id)
      .eq("step_key", targetStepKey)
      .single();

    if (nextStep) nextStepId = nextStep.id;
  }

  // Advance the candidate
  const updateFields: Record<string, unknown> = {
    status: newStatus,
    current_step_id: nextStepId,
    updated_at: new Date().toISOString(),
  };
  if (newStatus === "completed") {
    updateFields.onboarding_completed_at = new Date().toISOString();
  }

  await supabaseAdmin
    .from("candidates")
    .update(updateFields)
    .eq("id", candidate.id);

  let nextTokenUrl: string | null = null;

  // If there's a next step with documents, auto-send them
  if (nextStepKey && candidate.email) {
    try {
      // Check if next step has document assignments or form-enabled templates
      const { data: nextAssignments } = await supabaseAdmin
        .from("step_document_assignments")
        .select("id, required, document_templates(active)")
        .eq("pipeline_id", candidate.current_pipeline_id)
        .eq("step_key", nextStepKey);

      let nextRequiredCount = (nextAssignments || []).filter(
        (a: Record<string, unknown>) => {
          const tmpl = a.document_templates as Record<string, unknown> | null;
          return a.required && tmpl && tmpl.active;
        }
      ).length;

      // Fallback: count form-enabled templates if no assignments
      if (nextRequiredCount === 0) {
        const { count } = await supabaseAdmin
          .from("document_templates")
          .select("id", { count: "exact", head: true })
          .eq("step_key", nextStepKey)
          .eq("form_enabled", true)
          .eq("active", true);
        nextRequiredCount = count || 0;
      }

      if (nextRequiredCount > 0) {
        // Create a new token for the next step
        const { data: nextToken } = await supabaseAdmin
          .from("candidate_tokens")
          .insert({
            candidate_id: candidate.id,
            step_key: nextStepKey,
            pipeline_id: candidate.current_pipeline_id,
            required_doc_count: nextRequiredCount,
          })
          .select("token")
          .single();

        if (nextToken) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000");
          nextTokenUrl = `${baseUrl}/onboarding/${nextToken.token}`;
        }

        // Send next round of docs with the portal link
        await sendOnboardingDocsEmail({
          candidateId: candidate.id,
          candidateEmail: candidate.email,
          candidateName: candidate.full_name,
          stepKey: nextStepKey,
          pipelineId: candidate.current_pipeline_id,
          roleType: candidate.role_type,
          portalUrl: nextTokenUrl,
        });
      }
    } catch {
      // Email send failure shouldn't block advancement
    }
  }

  // Send notification email to team (market leader, DoS, admins)
  try {
    const { data: completedDocs } = await supabaseAdmin
      .from("candidate_documents")
      .select("form_data, document_template_id")
      .eq("candidate_token_id", ct.id)
      .eq("completed", true);

    const completedTemplateIds = (completedDocs || [])
      .map((d: Record<string, unknown>) => d.document_template_id)
      .filter(Boolean) as string[];

    let templateData: { id: string; name: string; form_fields: unknown[] }[] = [];
    if (completedTemplateIds.length > 0) {
      const { data: templates } = await supabaseAdmin
        .from("document_templates")
        .select("id, name, form_fields")
        .in("id", completedTemplateIds);
      templateData = (templates || []) as typeof templateData;
    }

    const notificationDocs = (completedDocs || []).map((doc: Record<string, unknown>) => {
      const tmpl = templateData.find((t) => t.id === doc.document_template_id);
      return {
        templateName: tmpl?.name || "Document",
        formFields: (tmpl?.form_fields || []) as { key: string; label: string; type: string }[],
        formData: (doc.form_data || {}) as Record<string, unknown>,
      };
    });

    await sendCompletionNotification({
      candidateId: candidate.id,
      candidateName: candidate.full_name,
      candidateRoleType: candidate.role_type,
      stepKey,
      completedDocs: notificationDocs,
    });
  } catch {
    // Notification failure shouldn't block advancement
  }

  // When advancing to completed, send any resource docs mapped to the completion step
  if (newStatus === "completed" && candidate.email) {
    try {
      const { data: resourceAssignments } = await supabaseAdmin
        .from("step_document_assignments")
        .select("*, document_templates(id, name, file_name, file_path, mime_type, active, form_enabled)")
        .eq("pipeline_id", candidate.current_pipeline_id)
        .eq("step_key", "completion");

      const resourceDocs = (resourceAssignments || []).filter((a: Record<string, unknown>) => {
        const tmpl = a.document_templates as Record<string, unknown> | null;
        return tmpl && tmpl.active && !tmpl.form_enabled;
      });

      if (resourceDocs.length > 0) {
        await sendOnboardingDocsEmail({
          candidateId: candidate.id,
          candidateEmail: candidate.email,
          candidateName: candidate.full_name,
          stepKey: "completion",
          pipelineId: candidate.current_pipeline_id,
          roleType: candidate.role_type,
        });
      }
    } catch {
      // Resource doc send failure shouldn't block
    }
  }

  return { allComplete: true, advanced: true, newStatus, nextTokenUrl };
}
