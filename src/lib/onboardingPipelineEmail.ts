import { Resend } from "resend";
import { supabaseAdmin } from "./supabaseAdmin";

const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@bytebitevending.com";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

interface SendDocsParams {
  candidateId: string;
  candidateEmail: string;
  candidateName: string;
  stepKey: string;
  pipelineId: string;
  roleType: string;
}

export async function sendOnboardingDocsEmail(params: SendDocsParams) {
  const { candidateId, candidateEmail, candidateName, stepKey, pipelineId, roleType } = params;

  const { data: assignments, error: assignErr } = await supabaseAdmin
    .from("step_document_assignments")
    .select("*, document_templates(*)")
    .eq("pipeline_id", pipelineId)
    .eq("step_key", stepKey)
    .order("order_index");

  if (assignErr) throw new Error(`Failed to fetch assignments: ${assignErr.message}`);
  if (!assignments || assignments.length === 0) {
    throw new Error("No documents assigned to this pipeline step. Please configure document mappings first.");
  }

  const activeAssignments = assignments.filter(
    (a: Record<string, unknown>) => {
      const tmpl = a.document_templates as Record<string, unknown> | null;
      return tmpl && tmpl.active === true;
    }
  );

  if (activeAssignments.length === 0) {
    throw new Error("No active document templates found for this step.");
  }

  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];

  for (const assignment of activeAssignments) {
    const template = assignment.document_templates as {
      file_path: string;
      file_name: string;
      mime_type: string;
    };

    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("document-templates")
      .download(template.file_path);

    if (downloadError || !fileData) {
      throw new Error(`Failed to download ${template.file_name}: ${downloadError?.message || "unknown error"}`);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    attachments.push({
      filename: template.file_name,
      content: buffer,
      contentType: template.mime_type || "application/pdf",
    });
  }

  const { data: emailTemplate } = await supabaseAdmin
    .from("email_templates_v2")
    .select("*")
    .eq("pipeline_type", roleType)
    .eq("step_key", stepKey)
    .maybeSingle();

  const subject = emailTemplate?.subject || `Onboarding Documents — ${stepKey}`;
  const bodyHtml = (emailTemplate?.body_html || "<p>Please find your documents attached.</p>")
    .replace(/\{\{candidate_name\}\}/g, candidateName);

  try {
    const { error: sendError } = await getResend().emails.send({
      from: FROM_EMAIL,
      to: candidateEmail,
      subject,
      html: bodyHtml,
      attachments,
    });

    await supabaseAdmin.from("email_logs").insert({
      candidate_id: candidateId,
      step_key: stepKey,
      recipient_email: candidateEmail,
      subject,
      status: sendError ? "failure" : "success",
      error_message: sendError?.message || null,
      attachment_count: attachments.length,
    });

    if (sendError) {
      throw new Error(`Email send failed: ${sendError.message}`);
    }

    return { success: true, attachmentCount: attachments.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";

    await supabaseAdmin.from("email_logs").insert({
      candidate_id: candidateId,
      step_key: stepKey,
      recipient_email: candidateEmail,
      subject,
      status: "failure",
      error_message: message,
      attachment_count: 0,
    });

    throw err;
  }
}
