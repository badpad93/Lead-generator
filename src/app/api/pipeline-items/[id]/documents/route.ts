import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: itemId } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const stepDocumentId = formData.get("step_document_id") as string;

  if (!file || !stepDocumentId) {
    return NextResponse.json({ error: "file and step_document_id required" }, { status: 400 });
  }

  const storagePath = `pipeline-docs/${itemId}/${Date.now()}_${file.name}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("sales-documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  // Upsert document record
  const { data: existing } = await supabaseAdmin
    .from("pipeline_item_documents")
    .select("id")
    .eq("pipeline_item_id", itemId)
    .eq("step_document_id", stepDocumentId)
    .maybeSingle();

  let doc;
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("pipeline_item_documents")
      .update({ file_url: storagePath, file_name: file.name, completed: true, uploaded_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    doc = data;
  } else {
    const { data, error } = await supabaseAdmin
      .from("pipeline_item_documents")
      .insert({
        pipeline_item_id: itemId,
        step_document_id: stepDocumentId,
        file_url: storagePath,
        file_name: file.name,
        completed: true,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    doc = data;
  }

  return NextResponse.json(doc, { status: 201 });
}
