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
    .select("*, document_templates(id, name, file_name, file_path, mime_type, active)")
    .eq("pipeline_id", ct.pipeline_id)
    .eq("step_key", ct.step_key)
    .order("order_index");

  const requiredDocs = (assignments || []).filter(
    (a: Record<string, unknown>) => {
      const tmpl = a.document_templates as Record<string, unknown> | null;
      return tmpl && tmpl.active === true;
    }
  );

  const { data: uploaded } = await supabaseAdmin
    .from("candidate_documents")
    .select("id, file_name, file_url, file_type, document_template_id, completed, created_at")
    .eq("candidate_id", ct.candidate_id)
    .eq("candidate_token_id", ct.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    token: ct.token,
    status: ct.status,
    step_key: ct.step_key,
    candidate_name: ct.candidates?.full_name || "",
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
        file_name: tmpl.file_name,
        file_path: tmpl.file_path,
        required: a.required,
        uploaded: !!uploadedDoc,
        uploaded_doc: uploadedDoc || null,
      };
    }),
    uploaded_documents: uploaded || [],
    submitted: ct.status === "submitted",
  });
}
