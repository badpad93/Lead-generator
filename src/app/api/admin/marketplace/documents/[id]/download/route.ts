import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/marketplace/documents/[id]/download
 *
 * Returns { url: <signed 5-minute URL> } for the underlying storage object.
 * The client fetches this with an Authorization header, then window.opens
 * the URL. Old rows store a public URL that 404s because the private bucket
 * doesn't serve them — this endpoint sidesteps that with a signed URL.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { data: doc } = await supabaseAdmin
    .from("placement_partner_documents")
    .select("id, partner_id, document_type, file_url, file_name")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Extract the storage object key from the file_url. Supabase public URLs
  // look like: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
  // Signed URLs look like: .../object/sign/<bucket>/<path>?token=...
  const bucket = "placement-partner-docs";
  let objectPath: string | null = null;
  if (doc.file_url) {
    const marker = `/${bucket}/`;
    const idx = doc.file_url.indexOf(marker);
    if (idx >= 0) {
      objectPath = doc.file_url.slice(idx + marker.length).split("?")[0];
    }
  }
  if (!objectPath) {
    return NextResponse.json(
      { error: "Could not resolve storage path for this document" },
      { status: 500 },
    );
  }

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(bucket)
    .createSignedUrl(objectPath, 60 * 5);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message || "Failed to create signed URL" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: signed.signedUrl, file_name: doc.file_name });
}
