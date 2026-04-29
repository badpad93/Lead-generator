import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { checkAndAdvanceCandidate } from "@/lib/candidateAdvancement";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"];
const MAX_SIZE = 10 * 1024 * 1024;

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

  if (ct.expires_at && new Date(ct.expires_at) < new Date()) {
    await supabaseAdmin.from("candidate_tokens").update({ status: "expired" }).eq("id", ct.id);
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentTemplateId = formData.get("document_template_id") as string | null;

  if (!file) return NextResponse.json({ error: "File is required" }, { status: 400 });
  if (!documentTemplateId) return NextResponse.json({ error: "document_template_id is required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });

  const ext = file.name.toLowerCase().split(".").pop();
  if (!ext || !ALLOWED_EXTENSIONS.some((e) => e === `.${ext}`)) {
    return NextResponse.json({ error: `File type .${ext} not allowed` }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `candidates/${ct.candidate_id}/${ct.step_key}/${timestamp}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("sales-documents")
    .upload(filePath, buffer, { contentType, upsert: false });

  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage.from("sales-documents").getPublicUrl(filePath);

  // Remove any previous upload for this template (replace, don't duplicate)
  await supabaseAdmin
    .from("candidate_documents")
    .delete()
    .eq("candidate_id", ct.candidate_id)
    .eq("candidate_token_id", ct.id)
    .eq("document_template_id", documentTemplateId);

  const { data: doc, error: insertErr } = await supabaseAdmin
    .from("candidate_documents")
    .insert({
      candidate_id: ct.candidate_id,
      step_key: ct.step_key,
      file_name: file.name,
      file_type: contentType,
      file_url: urlData.publicUrl || filePath,
      document_template_id: documentTemplateId,
      candidate_token_id: ct.id,
      completed: true,
    })
    .select("*")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Update submitted count on token
  const { data: uploadedCount } = await supabaseAdmin
    .from("candidate_documents")
    .select("id", { count: "exact" })
    .eq("candidate_token_id", ct.id);

  await supabaseAdmin
    .from("candidate_tokens")
    .update({ submitted_doc_count: uploadedCount?.length || 0 })
    .eq("id", ct.id);

  // Check if all required docs are now uploaded — if so, auto-advance
  const advanceResult = await checkAndAdvanceCandidate(ct.id);

  return NextResponse.json({
    document: doc,
    all_complete: advanceResult.allComplete,
    advanced: advanceResult.advanced,
    new_status: advanceResult.newStatus,
  }, { status: 201 });
}
