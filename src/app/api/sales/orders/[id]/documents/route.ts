import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const documentType = formData.get("document_type") as string || "other";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = new Uint8Array(bytes);
  const timestamp = Date.now();
  const storagePath = `orders/${id}/${timestamp}_${file.name}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("sales-documents")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: urlData } = supabaseAdmin.storage
    .from("sales-documents")
    .getPublicUrl(storagePath);

  const { data, error } = await supabaseAdmin
    .from("order_documents")
    .insert({
      order_id: id,
      document_type: documentType,
      file_name: file.name,
      file_url: urlData.publicUrl,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "document_uploaded",
    description: `Uploaded: ${file.name}`,
  });

  return NextResponse.json(data, { status: 201 });
}
