import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/financial/payments/proof
 *
 * Admin uploads a proof-of-payment (screenshot, PDF of ACH confirmation, etc)
 * to the private `payment-proofs` bucket. Returns { bucket, path } that the
 * admin then passes to POST /api/admin/financial/payments as the proof_*
 * fields.
 *
 * The proof is never public. Later download is served through
 * /api/admin/financial/payments/[id]/proof which mints a 5-minute signed URL.
 */

const BUCKET = "payment-proofs";

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });

  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const timestamp = Date.now();
  const path = `${adminId}/${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    bucket: BUCKET,
    path,
    file_name: file.name,
  });
}
