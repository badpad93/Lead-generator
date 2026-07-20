import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * DELETE /api/website-requests/[id]/media/[mediaId]
 * Remove an uploaded asset (also deletes the bucket file). Only the
 * owner can delete, and only while the request is still editable.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, mediaId } = await params;

  const { data: request } = await supabaseAdmin
    .from("website_requests")
    .select("id, user_id, status, logo_media_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "draft" && request.status !== "needs_information") {
    return NextResponse.json({ error: "Request is not editable" }, { status: 409 });
  }

  const { data: media } = await supabaseAdmin
    .from("website_request_media")
    .select("*")
    .eq("id", mediaId)
    .eq("request_id", id)
    .maybeSingle();
  if (!media) return NextResponse.json({ error: "Media not found" }, { status: 404 });

  if (media.file_path) {
    await supabaseAdmin.storage.from("website-request-media").remove([media.file_path]).catch(() => {});
  }
  await supabaseAdmin.from("website_request_media").delete().eq("id", mediaId);

  // If we just deleted the logo, clear the FK so the wizard doesn't
  // dangle-render a preview.
  if (request.logo_media_id === mediaId) {
    await supabaseAdmin
      .from("website_requests")
      .update({ logo_media_id: null, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json({ ok: true });
}
