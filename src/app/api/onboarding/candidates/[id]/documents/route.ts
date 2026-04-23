import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_SIZE = 10 * 1024 * 1024;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("candidate_documents")
    .select("*")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const stepKey = formData.get("step_key") as string | null;

  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (!stepKey) return NextResponse.json({ error: "step_key required" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: "File type not allowed" }, { status: 400 });

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `candidates/${id}/${stepKey}/${timestamp}_${safeName}`;

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("sales-documents")
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: urlData } = supabaseAdmin.storage.from("sales-documents").getPublicUrl(filePath);

  const { data, error } = await supabaseAdmin
    .from("candidate_documents")
    .insert({
      candidate_id: id,
      step_key: stepKey,
      file_name: file.name,
      file_type: file.type,
      file_url: urlData.publicUrl || filePath,
      uploaded_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
