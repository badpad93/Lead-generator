import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const pipeline_type = url.searchParams.get("pipeline_type");
  const step_key = url.searchParams.get("step_key");
  const active_only = url.searchParams.get("active_only");

  let query = supabaseAdmin
    .from("document_templates")
    .select("*")
    .order("created_at", { ascending: false });

  if (pipeline_type) query = query.eq("pipeline_type", pipeline_type);
  if (step_key) query = query.eq("step_key", step_key);
  if (active_only === "true") query = query.eq("active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp", ".gif", ".txt", ".csv", ".xls", ".xlsx", ".rtf"];

function isAllowedFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = formData.get("name") as string | null;
  const pipeline_type = formData.get("pipeline_type") as string | null;
  const step_key = formData.get("step_key") as string | null;
  const version = formData.get("version") as string | null;

  if (!file || !name || !pipeline_type || !step_key) {
    return NextResponse.json({ error: "file, name, pipeline_type, and step_key required" }, { status: 400 });
  }

  if (!isAllowedFile(file)) {
    return NextResponse.json({ error: `File type not allowed: ${file.name}` }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${pipeline_type}/${step_key}/${timestamp}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";

  const { error: uploadErr } = await supabaseAdmin.storage
    .from("document-templates")
    .upload(filePath, buffer, { contentType, upsert: false });

  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data, error } = await supabaseAdmin
    .from("document_templates")
    .insert({
      name,
      pipeline_type,
      step_key,
      file_path: filePath,
      file_name: file.name,
      mime_type: contentType,
      version: version ? parseInt(version) : 1,
      active: true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
