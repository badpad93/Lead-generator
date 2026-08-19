import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/contractorOnboarding/token";

/**
 * W-9 upload for the contractor onboarding flow.
 *
 * POST multipart/form-data with { file: <PDF> } — token in URL.
 * Verifies the token (constant-time hash), refuses if the packet is
 * locked / revoked / expired, uploads the PDF to the PRIVATE bucket
 * contractor-onboarding-documents at path
 *   {onboarding_id}/w9/{timestamp}-{safeName}.pdf
 * then stamps w9_storage_path / w9_uploaded_at / w9_original_filename
 * on the onboarding row.
 *
 * Response is a metadata acknowledgment only — never exposes the
 * storage path or a signed URL to the contractor's browser.
 * Uploading a second time supersedes the first (previous path is
 * cleaned up so the private bucket doesn't accumulate orphans).
 */

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const BUCKET = "contractor-onboarding-documents";

interface OnboardingRow {
  id: string;
  status: string;
  locked: boolean;
  token_expires_at: string;
  w9_storage_path: string | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const hash = hashToken(token);
  const { data: row } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("id, status, locked, token_expires_at, w9_storage_path")
    .eq("token_hash", hash)
    .maybeSingle();
  const onboarding = row as OnboardingRow | null;
  if (!onboarding) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }
  if (onboarding.locked || onboarding.status === "completed") {
    return NextResponse.json({ error: "This packet is locked." }, { status: 409 });
  }
  if (onboarding.status === "revoked") {
    return NextResponse.json({ error: "This link has been cancelled." }, { status: 410 });
  }
  if (new Date(onboarding.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 15 MB" }, { status: 413 });
  }
  const mime = file.type || "application/pdf";
  if (mime !== "application/pdf") {
    return NextResponse.json({ error: "W-9 must be a PDF" }, { status: 415 });
  }

  const safeName = (file.name || "w9.pdf").replace(/[^\w.\-]/g, "_").slice(-120);
  const storagePath = `${onboarding.id}/w9/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("contractor_onboarding")
    .update({
      w9_storage_path: storagePath,
      w9_uploaded_at: nowIso,
      w9_original_filename: file.name || "w9.pdf",
      updated_at: nowIso,
    })
    .eq("id", onboarding.id);
  if (updateErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Clean up the previous W-9 if this is a replacement upload — the
  // private bucket has service-role-only reads; orphans still cost
  // storage. Best effort, never blocks the response.
  if (onboarding.w9_storage_path && onboarding.w9_storage_path !== storagePath) {
    supabaseAdmin.storage.from(BUCKET).remove([onboarding.w9_storage_path]).catch(() => {});
  }

  return NextResponse.json({
    w9_received: true,
    w9_uploaded_at: nowIso,
    w9_original_filename: file.name || "w9.pdf",
  });
}
