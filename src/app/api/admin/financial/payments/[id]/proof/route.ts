import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/financial/payments/[id]/proof
 *
 * Returns { url } — a fresh 5-minute signed URL for the proof file on the
 * payment. Admin-only. Client fetches this, opens the URL.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: payment } = await supabaseAdmin
    .from("payments")
    .select("proof_bucket, proof_path")
    .eq("id", id)
    .maybeSingle();
  if (!payment?.proof_bucket || !payment.proof_path) {
    return NextResponse.json({ error: "No proof attached to this payment" }, { status: 404 });
  }

  const { data: signed, error } = await supabaseAdmin.storage
    .from(payment.proof_bucket)
    .createSignedUrl(payment.proof_path, 60 * 5);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message || "Failed to sign URL" }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl });
}
