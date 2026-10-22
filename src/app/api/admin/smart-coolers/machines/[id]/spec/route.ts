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

/*
 * Spec sheets can be large PDFs. Routing the bytes through this serverless
 * handler trips the platform's ~4.5MB request-body limit (the browser just
 * sees a generic "Request failed"), so the file is uploaded straight to
 * Supabase Storage from the browser via a short-lived signed upload URL:
 *   POST  → mint a signed upload URL for a fresh object key
 *   PATCH → commit the uploaded key onto the machine row
 *   DELETE → clear the spec sheet
 */

/** Validate the spec metadata sent when minting a signed upload URL. */
function validateSpecMeta(contentType: unknown, size: unknown): NextResponse | null {
  if (typeof contentType !== "string" || !SPEC_ALLOWED_MIME.has(contentType)) {
    return NextResponse.json({ error: "Please upload a PDF or image (PNG/JPEG/WebP)" }, { status: 415 });
  }
  if (typeof size === "number" && size > SPEC_MAX_BYTES) {
    return NextResponse.json({ error: "Spec file must be under 20MB" }, { status: 413 });
  }
  return null;
}

/** POST /api/admin/smart-coolers/machines/[id]/spec — mint a signed upload URL. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const bad = validateSpecMeta(body.content_type, body.size);
  if (bad) return bad;

  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const key = `${id}/spec-${Date.now()}${extensionFromMime(body.content_type as string)}`;
  const { data, error } = await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).createSignedUploadUrl(key);
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Could not start upload" }, { status: 500 });
  }

  return NextResponse.json({ bucket: SMART_COOLER_BUCKET, key, token: data.token });
}

/** Point the row at the uploaded spec object, cleaning up any prior one. */
async function commitSpecKey(id: string, key: string): Promise<NextResponse> {
  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("spec_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Machine not found" }, { status: 404 });

  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .update({ spec_path: key, updated_at: updatedAt })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([key]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const priorPath = (row as { spec_path?: string | null }).spec_path ?? null;
  if (priorPath && priorPath !== key) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove([priorPath]);
  }
  return NextResponse.json({ ok: true, spec_url: machineImageUrl(key, updatedAt) });
}

/** PATCH /api/admin/smart-coolers/machines/[id]/spec — commit an uploaded spec object. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const key = body.key as string | undefined;
  if (!key || !key.startsWith(`${id}/`)) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
  }

  return commitSpecKey(id, key);
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
