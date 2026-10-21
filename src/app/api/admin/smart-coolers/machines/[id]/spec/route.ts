import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  SMART_COOLER_BUCKET,
  SPEC_ALLOWED_MIME,
  SPEC_MAX_BYTES,
  extensionFromMime,
  machineImageUrl,
} from "@/lib/smartCoolerMachines";

/** Validate the uploaded spec file (PDF or image). */
function validateSpec(file: unknown): { error: NextResponse } | { file: File } {
  if (!(file instanceof File)) {
    return { error: NextResponse.json({ error: "file is required" }, { status: 400 }) };
  }
  if (!SPEC_ALLOWED_MIME.has(file.type)) {
    return { error: NextResponse.json({ error: "Please upload a PDF or image (PNG/JPEG/WebP)" }, { status: 415 }) };
  }
  if (file.size > SPEC_MAX_BYTES) {
    return { error: NextResponse.json({ error: "Spec file must be under 20MB" }, { status: 413 }) };
  }
  return { file };
}

/** PUT /api/admin/smart-coolers/machines/[id]/spec — upload/replace the spec sheet. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  const validated = validateSpec(form?.get("file"));
  if ("error" in validated) return validated.error;
  const file = validated.file;
  const mime = file.type;

  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("spec_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const key = `${id}/spec-${Date.now()}${extensionFromMime(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(SMART_COOLER_BUCKET)
    .upload(key, buffer, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  return commitSpec(id, key, (row as { spec_path?: string | null }).spec_path ?? null);
}

/** Point the row at the new spec object, rolling back / cleaning up on the way. */
async function commitSpec(id: string, key: string, priorPath: string | null): Promise<NextResponse> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .update({ spec_path: key, updated_at: updatedAt })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([key]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (priorPath && priorPath !== key) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([priorPath]);
  }
  return NextResponse.json({ ok: true, spec_url: machineImageUrl(key, updatedAt) });
}

/** DELETE /api/admin/smart-coolers/machines/[id]/spec — clear the spec sheet. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("spec_path")
    .eq("id", id)
    .maybeSingle();

  await supabaseAdmin
    .from("smart_cooler_machines")
    .update({ spec_path: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (row?.spec_path) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([row.spec_path]);
  }

  return NextResponse.json({ ok: true });
}
