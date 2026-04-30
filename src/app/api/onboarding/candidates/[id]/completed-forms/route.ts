import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: candidate } = await supabaseAdmin
    .from("candidates")
    .select("id, full_name, email, phone, role_type, status")
    .eq("id", id)
    .single();

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  const { data: docs } = await supabaseAdmin
    .from("candidate_documents")
    .select("id, step_key, file_name, form_data, completed, document_template_id, created_at")
    .eq("candidate_id", id)
    .eq("completed", true)
    .order("created_at");

  const templateIds = (docs || [])
    .map((d) => d.document_template_id)
    .filter(Boolean) as string[];

  let templatesById: Record<string, { name: string; form_fields: unknown[]; description: string | null }> = {};
  if (templateIds.length > 0) {
    const { data: templates } = await supabaseAdmin
      .from("document_templates")
      .select("id, name, form_fields, description")
      .in("id", templateIds);

    templatesById = Object.fromEntries(
      (templates || []).map((t) => [t.id, { name: t.name, form_fields: t.form_fields || [], description: t.description }])
    );
  }

  const completedForms = (docs || []).map((doc) => {
    const template = doc.document_template_id ? templatesById[doc.document_template_id] : null;
    return {
      id: doc.id,
      step_key: doc.step_key,
      file_name: doc.file_name,
      form_data: doc.form_data,
      template_name: template?.name || doc.file_name,
      template_description: template?.description || null,
      form_fields: template?.form_fields || [],
      created_at: doc.created_at,
    };
  });

  return NextResponse.json({ candidate, completed_forms: completedForms });
}
