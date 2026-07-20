import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { signedMediaUrl } from "@/lib/websiteRequests";

/**
 * POST /api/website-requests/[id]/media
 * multipart/form-data:
 *   file       — File
 *   kind       — 'logo'|'staff'|'location'|'machine'|'product'|'video'|'testimonial'
 *   caption    — optional
 *
 * OR JSON body for video_link:
 *   { kind: 'video_link', external_url, caption? }
 *
 * File uploads land in the private website-request-media bucket.
 * Returns the media row + a fresh signed_url so the wizard can render
 * the preview immediately.
 */

const MAX_BYTES = 15 * 1024 * 1024;   // 15 MB per file
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const IMAGE_KINDS = new Set(["logo", "staff", "location", "machine", "product", "testimonial"]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: request } = await supabaseAdmin
    .from("website_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "draft" && request.status !== "needs_information") {
    return NextResponse.json({ error: "Request is not editable" }, { status: 409 });
  }

  const contentType = req.headers.get("content-type") || "";

  // Video link branch — JSON body, no file.
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    if (body.kind !== "video_link") {
      return NextResponse.json({ error: "kind must be 'video_link' for JSON body" }, { status: 400 });
    }
    const url = typeof body.external_url === "string" ? body.external_url.trim() : "";
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "external_url must be a valid https URL" }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from("website_request_media")
      .insert({
        request_id: id,
        kind: "video_link",
        external_url: url,
        caption: typeof body.caption === "string" ? body.caption.trim() : null,
        uploaded_by: userId,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ media: data });
  }

  const fd = await req.formData();
  const file = fd.get("file");
  const kind = String(fd.get("kind") || "");
  const caption = String(fd.get("caption") || "").trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!IMAGE_KINDS.has(kind) && kind !== "video") {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 15 MB" }, { status: 413 });
  }
  const mime = file.type || "application/octet-stream";
  if (kind === "video" && !ALLOWED_VIDEO_MIME.has(mime)) {
    return NextResponse.json({ error: `Unsupported video type: ${mime}` }, { status: 415 });
  }
  if (kind !== "video" && !ALLOWED_IMAGE_MIME.has(mime)) {
    return NextResponse.json({ error: `Unsupported image type: ${mime}` }, { status: 415 });
  }

  const ext = file.name.split(".").pop() || (mime.split("/")[1] || "bin");
  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(-80);
  const path = `${userId}/${id}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin
    .storage
    .from("website-request-media")
    .upload(path, buffer, { contentType: mime, upsert: false });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: mediaRow, error: insertErr } = await supabaseAdmin
    .from("website_request_media")
    .insert({
      request_id: id,
      kind,
      file_path: path,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: mime,
      caption,
      uploaded_by: userId,
      sort_order: Date.now(),
    })
    .select("*")
    .single();
  if (insertErr) {
    // Best-effort cleanup — orphaned bucket file otherwise
    await supabaseAdmin.storage.from("website-request-media").remove([path]).catch(() => {});
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // If this was a logo, stamp the FK on the parent request.
  if (kind === "logo") {
    await supabaseAdmin
      .from("website_requests")
      .update({ logo_media_id: mediaRow.id, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  const signed = await signedMediaUrl(path);
  return NextResponse.json({ media: { ...mediaRow, signed_url: signed } });
}
