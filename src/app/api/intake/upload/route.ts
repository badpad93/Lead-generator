import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const accountId = formData.get("account_id") as string | null;
  const dealId = formData.get("deal_id") as string | null;
  const fileType = formData.get("file_type") as string || "document";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File type not allowed" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  // Build storage path
  const folder = accountId ? `rep-docs/${accountId}` : "rep-docs/unlinked";
  const ext = file.name.split(".").pop() || "bin";
  const filename = `${fileType}_${Date.now()}.${ext}`;
  const storagePath = `${folder}/${filename}`;

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("sales-documents")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Generate signed URL (24h)
  const { data: signedData } = await supabaseAdmin.storage
    .from("sales-documents")
    .createSignedUrl(storagePath, 60 * 60 * 24);

  const signedUrl = signedData?.signedUrl || "";

  // Save to documents table
  const { data: doc, error: docError } = await supabaseAdmin
    .from("sales_documents")
    .insert({
      account_id: accountId || null,
      order_id: dealId || null,
      file_url: storagePath,
      type: fileType as "contract" | "receipt" | "order_pdf",
      file_name: file.name,
    })
    .select("id")
    .single();

  if (docError) {
    return NextResponse.json({ error: "File uploaded but failed to save record" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    document_id: doc?.id,
    file_url: storagePath,
    signed_url: signedUrl,
    file_name: file.name,
  });
}
