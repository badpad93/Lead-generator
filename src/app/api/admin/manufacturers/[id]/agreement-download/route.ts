import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);
const BUCKET = "manufacturer-partner-docs";
const SIGNED_URL_TTL_SEC = 300;

/**
 * GET /api/admin/manufacturers/[id]/agreement-download
 *   Returns a 5-minute signed URL for the manufacturer's currently
 *   active (non-superseded) agreement PDF. Every access is audit-
 *   logged. Signed URL itself never enters the audit trail.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { data: agreement } = await supabaseAdmin
    .from("manufacturer_agreements")
    .select("id, agreement_version, executed_pdf_storage_path")
    .eq("manufacturer_partner_id", id)
    .is("superseded_at", null)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!agreement?.executed_pdf_storage_path) {
    return NextResponse.json({ error: "No executed agreement yet." }, { status: 404 });
  }

  const { data: signed, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(agreement.executed_pdf_storage_path, SIGNED_URL_TTL_SEC);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Signed URL failure" }, { status: 500 });
  }

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: "manufacturer_agreement_downloaded",
      entity_type: "manufacturer_agreement",
      entity_id: agreement.id,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SEC,
    version: agreement.agreement_version,
  });
}
