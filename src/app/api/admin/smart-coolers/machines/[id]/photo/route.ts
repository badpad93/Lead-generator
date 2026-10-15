import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  SMART_COOLER_BUCKET,
  MACHINE_ALLOWED_MIME,
  MACHINE_MAX_BYTES,
  extensionFromMime,
  machineImageUrl,
} from "@/lib/smartCoolerMachines";

/** Validate the uploaded image; returns a NextResponse to reject, or the file to accept. */
function validateImage(file: unknown): { error: NextResponse } | { file: File } {
  if (!(file instanceof File)) {
    return { error: NextResponse.json({ error: "file is required" }, { status: 400 }) };
  }
  if (!MACHINE_ALLOWED_MIME.has(file.type)) {
    return { error: NextResponse.json({ error: "Please upload a PNG, JPEG, or WebP image" }, { status: 415 }) };
  }
  if (file.size > MACHINE_MAX_BYTES) {
    return { error: NextResponse.json({ error: "Image must be under 10MB" }, { status: 413 }) };
  }
  return { file };
}

/** PUT /api/admin/smart-coolers/machines/[id]/photo — upload/replace the photo. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  const validated = validateImage(form?.get("file"));
  if ("error" in validated) return validated.error;
  const file = validated.file;
  const mime = file.type;

  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const key = `${id}/${Date.now()}${extensionFromMime(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(SMART_COOLER_BUCKET)
    .upload(key, buffer, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  return commitPhoto(id, key, (row as { image_path?: string | null }).image_path ?? null);
}

/** Point the row at the new object, rolling back / cleaning up on the way. */
async function commitPhoto(id: string, key: string, priorPath: string | null): Promise<NextResponse> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .update({ image_path: key, updated_at: updatedAt })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([key]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (priorPath && priorPath !== key) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([priorPath]);
  }
  return NextResponse.json({ ok: true, image_url: machineImageUrl(key, updatedAt) });
}

/** DELETE /api/admin/smart-coolers/machines/[id]/photo — clear the photo. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("image_path")
    .eq("id", id)
    .maybeSingle();

  await supabaseAdmin
    .from("smart_cooler_machines")
    .update({ image_path: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (row?.image_path) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([row.image_path]);
  }

  return NextResponse.json({ ok: true });
}
