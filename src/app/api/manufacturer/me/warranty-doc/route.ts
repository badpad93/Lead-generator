import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * Warranty document upload for the manufacturer application.
 *
 * POST multipart/form-data with { file: <PDF|JPEG|PNG> }. Persists
 * to the PRIVATE bucket manufacturer-partner-docs at path
 *   {partner_id}/warranty/{timestamp}-{safeName}
 * and stamps warranty_doc_storage_path on the manufacturer_partners
 * row. Replacing an existing warranty file cleans up the old blob
 * so orphans don't accumulate.
 *
 * Response is metadata-only — never returns the storage path or a
 * signed URL. Admin download flows through a separate role-gated
 * endpoint (ships in commit 8).
 */

const MAX_BYTES = 15 * 1024 * 1024;
const BUCKET = "manufacturer-partner-docs";
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("id, status, warranty_doc_storage_path")
    .eq("id", userId)
    .maybeSingle();
  if (!partner) {
    return NextResponse.json({ error: "No partner record yet" }, { status: 404 });
  }
  // Same freeze rule as the top-level PATCH — once past the drafting
  // stages, admin is reviewing and the application content is
  // immutable client-side.
  if (partner.status !== "draft" && partner.status !== "changes_requested") {
    return NextResponse.json(
      { error: "This application is locked from further edits." },
      { status: 409 },
    );
  }

  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: "File is empty" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 15 MB" }, { status: 413 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: "Warranty doc must be PDF, JPEG, or PNG" },
      { status: 415 },
    );
  }

  const safeName = (file.name || "warranty.pdf")
    .replace(/[^\w.\-]/g, "_")
    .slice(-120);
  const storagePath = `${userId}/warranty/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("manufacturer_partners")
    .update({ warranty_doc_storage_path: storagePath, updated_at: nowIso })
    .eq("id", userId);
  if (updateErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Clean up the previous doc if replacing.
  if (partner.warranty_doc_storage_path && partner.warranty_doc_storage_path !== storagePath) {
    supabaseAdmin.storage.from(BUCKET).remove([partner.warranty_doc_storage_path]).catch(() => {});
  }

  return NextResponse.json({
    warranty_doc_received: true,
    warranty_doc_original_name: file.name || "warranty.pdf",
    uploaded_at: nowIso,
  });
}
