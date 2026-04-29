import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAndAdvanceCandidate } from "@/lib/candidateAdvancement";

interface FormField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: ct, error } = await supabaseAdmin
    .from("candidate_tokens")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !ct) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  if (ct.status === "expired" || ct.status === "submitted") {
    return NextResponse.json({ error: "This submission link is no longer active" }, { status: 410 });
  }

  const body = await req.json();
  const { document_template_id, form_data } = body;

  if (!document_template_id) {
    return NextResponse.json({ error: "document_template_id is required" }, { status: 400 });
  }
  if (!form_data || typeof form_data !== "object") {
    return NextResponse.json({ error: "form_data is required" }, { status: 400 });
  }

  // Fetch the template to validate fields
  const { data: template } = await supabaseAdmin
    .from("document_templates")
    .select("id, name, form_fields, form_enabled")
    .eq("id", document_template_id)
    .single();

  if (!template || !template.form_enabled) {
    return NextResponse.json({ error: "This document does not support form submission" }, { status: 400 });
  }

  // Validate required fields
  const fields = (template.form_fields || []) as FormField[];
  const missing: string[] = [];
  for (const field of fields) {
    if (field.required) {
      const val = form_data[field.key];
      if (val === undefined || val === null || val === "" || val === false) {
        missing.push(field.label);
      }
    }
  }

  if (missing.length > 0) {
    return NextResponse.json({
      error: `Required fields missing: ${missing.join(", ")}`,
    }, { status: 400 });
  }

  // Remove any previous submission for this template
  await supabaseAdmin
    .from("candidate_documents")
    .delete()
    .eq("candidate_id", ct.candidate_id)
    .eq("candidate_token_id", ct.id)
    .eq("document_template_id", document_template_id);

  const { data: doc, error: insertErr } = await supabaseAdmin
    .from("candidate_documents")
    .insert({
      candidate_id: ct.candidate_id,
      step_key: ct.step_key,
      file_name: `${template.name} — Completed Form`,
      file_type: "application/json",
      file_url: "",
      document_template_id,
      candidate_token_id: ct.id,
      completed: true,
      form_data,
    })
    .select("*")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Update submitted count on token
  const { data: uploadedCount } = await supabaseAdmin
    .from("candidate_documents")
    .select("id", { count: "exact" })
    .eq("candidate_token_id", ct.id)
    .eq("completed", true);

  await supabaseAdmin
    .from("candidate_tokens")
    .update({ submitted_doc_count: uploadedCount?.length || 0 })
    .eq("id", ct.id);

  // Check if all required docs are now complete — auto-advance if so
  const advanceResult = await checkAndAdvanceCandidate(ct.id);

  return NextResponse.json({
    document: doc,
    all_complete: advanceResult.allComplete,
    advanced: advanceResult.advanced,
    new_status: advanceResult.newStatus,
  }, { status: 201 });
}
