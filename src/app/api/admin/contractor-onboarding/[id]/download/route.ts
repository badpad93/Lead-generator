import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * GET /api/admin/contractor-onboarding/[id]/download?kind=packet|w9
 *
 * Returns a short-lived signed URL for the requested document from
 * the PRIVATE contractor-onboarding-documents bucket. Never emits
 * public URLs; every hit re-signs so a stale share can't be replayed.
 *
 * Access control:
 *   - packet: elevated roles (admin / DOS / market_leader).
 *     Sales managers do NOT see the signed packet — includes
 *     everything from tax status to signature audit trail.
 *   - w9: elevated roles ONLY, further gated by the fact that this
 *     endpoint audits every download.
 *
 * Signed URL TTL is 5 minutes (300 s) — long enough for the admin's
 * browser to fetch/preview, short enough that a leaked link expires
 * fast.
 */

const ELEVATED_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);
const SIGNED_URL_TTL_SEC = 300;
const BUCKET = "contractor-onboarding-documents";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!ELEVATED_ROLES.has(user.role)) {
    return NextResponse.json(
      { error: "Only admin / director / market leader can download restricted documents." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (kind !== "packet" && kind !== "w9") {
    return NextResponse.json({ error: "kind must be 'packet' or 'w9'" }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("id, contractor_email, packet_pdf_storage_path, w9_storage_path, w9_original_filename")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storagePath =
    kind === "packet" ? (row.packet_pdf_storage_path as string | null)
                      : (row.w9_storage_path as string | null);
  if (!storagePath) {
    return NextResponse.json({ error: `${kind} not available yet.` }, { status: 404 });
  }

  const { data: signed, error } = await supabaseAdmin
    .storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? "Failed to sign URL" }, { status: 500 });
  }

  // Audit every restricted download so misuse leaves a trail. We
  // record the actor + kind but NOT the signed URL itself.
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: kind === "w9" ? "contractor_onboarding_w9_downloaded" : "contractor_onboarding_packet_downloaded",
      entity_type: "contractor_onboarding",
      entity_id: id,
      metadata: { kind },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SEC,
    kind,
    original_filename: kind === "w9" ? row.w9_original_filename : null,
  });
}
