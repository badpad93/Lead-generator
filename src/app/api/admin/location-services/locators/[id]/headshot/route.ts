import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { LOCATOR_BUCKET, HEADSHOT_ALLOWED_MIME, HEADSHOT_MAX_BYTES, extensionFromMime, headshotUrl } from "@/lib/locationServices";

/** Validate the uploaded headshot. */
function validateImage(file: unknown): { error: NextResponse } | { file: File } {
  if (!(file instanceof File)) {
    return { error: NextResponse.json({ error: "file is required" }, { status: 400 }) };
  }
  if (!HEADSHOT_ALLOWED_MIME.has(file.type)) {
    return { error: NextResponse.json({ error: "Please upload a PNG, JPEG, or WebP image" }, { status: 415 }) };
  }
  if (file.size > HEADSHOT_MAX_BYTES) {
    return { error: NextResponse.json({ error: "Image must be under 4MB" }, { status: 413 }) };
  }
  return { file };
}

/** Point the row at the new object, cleaning up the prior one. */
async function commit(id: string, key: string, priorPath: string | null): Promise<NextResponse> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("location_service_locators")
    .update({ headshot_path: key, updated_at: updatedAt })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(LOCATOR_BUCKET).remove([key]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (priorPath && priorPath !== key) {
    await supabaseAdmin.storage.from(LOCATOR_BUCKET).remove([priorPath]);
  }
  return NextResponse.json({ ok: true, headshot_url: headshotUrl(key, updatedAt) });
}

/** PUT /api/admin/location-services/locators/[id]/headshot — upload/replace. */
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
    .from("location_service_locators")
    .select("headshot_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Locator not found" }, { status: 404 });

  const key = `${id}/${Date.now()}${extensionFromMime(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(LOCATOR_BUCKET)
    .upload(key, buffer, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  return commit(id, key, (row as { headshot_path?: string | null }).headshot_path ?? null);
}

/** DELETE /api/admin/location-services/locators/[id]/headshot — clear the headshot. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("location_service_locators")
    .select("headshot_path")
    .eq("id", id)
    .maybeSingle();

  await supabaseAdmin
    .from("location_service_locators")
    .update({ headshot_path: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (row?.headshot_path) {
    await supabaseAdmin.storage.from(LOCATOR_BUCKET).remove([row.headshot_path as string]);
  }

  return NextResponse.json({ ok: true });
}
