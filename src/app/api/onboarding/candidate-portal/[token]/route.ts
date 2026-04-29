import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: ct, error } = await supabaseAdmin
    .from("candidate_tokens")
    .select("*, candidates(id, full_name, email, role_type, status)")
    .eq("token", token)
    .single();

  if (error || !ct) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (ct.status === "expired") {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  if (ct.expires_at && new Date(ct.expires_at) < new Date()) {
    await supabaseAdmin.from("candidate_tokens").update({ status: "expired" }).eq("id", ct.id);
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  if (ct.status === "pending") {
    await supabaseAdmin
      .from("candidate_tokens")
      .update({ status: "viewed", viewed_at: new Date().toISOString() })
      .eq("id", ct.id);
  }

  const { data: assignments } = await supabaseAdmin
    .from("step_document_assignments")
    .select("*, document_templates(id, name, file_name, file_path, mime_type, active, form_enabled, form_fields, description)")
    .eq("pipeline_id", ct.pipeline_id)
    .eq("step_key", ct.step_key)
    .order("order_index");

  let requiredDocs = (assignments || []).filter(
    (a: Record<string, unknown>) => {
      const tmpl = a.document_templates as Record<string, unknown> | null;
      return tmpl && tmpl.active === true;
    }
  );

  // Fallback: if no assignments exist, load form-enabled templates for this step directly
  if (requiredDocs.length === 0) {
    const { data: formTemplates } = await supabaseAdmin
      .from("document_templates")
      .select("id, name, file_name, file_path, mime_type, active, form_enabled, form_fields, description")
      .eq("step_key", ct.step_key)
      .eq("form_enabled", true)
      .eq("active", true)
      .order("created_at");

    if (formTemplates && formTemplates.length > 0) {
      requiredDocs = formTemplates.map((tmpl, idx) => ({
        id: `fallback-${tmpl.id}`,
        pipeline_id: ct.pipeline_id,
        step_key: ct.step_key,
        document_template_id: tmpl.id,
        required: true,
        order_index: idx,
        document_templates: tmpl,
      }));
    }
  }

  const { data: uploaded } = await supabaseAdmin
    .from("candidate_documents")
    .select("id, file_name, file_url, file_type, document_template_id, completed, form_data, created_at")
    .eq("candidate_id", ct.candidate_id)
    .eq("candidate_token_id", ct.id)
    .order("created_at", { ascending: false });

  const candidate = ct.candidates as Record<string, unknown> | null;

  return NextResponse.json({
    token: ct.token,
    status: ct.status,
    step_key: ct.step_key,
    candidate_name: candidate?.full_name || "",
    candidate_email: candidate?.email || "",
    required_documents: requiredDocs.map((a: Record<string, unknown>) => {
      const tmpl = a.document_templates as Record<string, unknown>;
      const templateId = tmpl.id as string;
      const uploadedDoc = (uploaded || []).find(
        (u: Record<string, unknown>) => u.document_template_id === templateId
      );
      return {
        assignment_id: a.id,
        template_id: templateId,
        name: tmpl.name,
        description: tmpl.description || null,
        file_name: tmpl.file_name,
        file_path: tmpl.file_path,
        required: a.required,
        form_enabled: tmpl.form_enabled || false,
        form_fields: tmpl.form_fields || null,
        uploaded: !!uploadedDoc,
        uploaded_doc: uploadedDoc || null,
      };
    }),
    uploaded_documents: uploaded || [],
    submitted: ct.status === "submitted",
  });
}
