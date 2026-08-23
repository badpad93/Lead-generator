import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

const BUCKET = "manufacturer-partner-docs";
const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png"]);

/**
 * POST /api/manufacturer/me/orders/[id]/bol
 *   Bill of Lading upload for a shipped or shippable order. Stored
 *   in the private manufacturer-partner-docs bucket at
 *     {partner_id}/orders/{order_id}/bol/{ts}-{safeName}
 *   Never returns the storage path — the fulfillment portal only
 *   needs a bol_uploaded boolean.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: purchase } = await supabaseAdmin
    .from("machine_listing_purchases")
    .select("id, manufacturer_partner_id, bill_of_lading_storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!purchase || purchase.manufacturer_partner_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
    return NextResponse.json({ error: "BOL must be PDF, JPEG, or PNG" }, { status: 415 });
  }

  const safeName = (file.name || "bol.pdf").replace(/[^\w.\-]/g, "_").slice(-120);
  const storagePath = `${userId}/orders/${id}/bol/${Date.now()}-${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false });
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { error: updateErr } = await supabaseAdmin
    .from("machine_listing_purchases")
    .update({ bill_of_lading_storage_path: storagePath, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (updateErr) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (purchase.bill_of_lading_storage_path && purchase.bill_of_lading_storage_path !== storagePath) {
    supabaseAdmin.storage.from(BUCKET).remove([purchase.bill_of_lading_storage_path]).catch(() => {});
  }

  return NextResponse.json({ bol_uploaded: true });
}
