import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

/**
 * POST /api/admin/manufacturers/pricing-exceptions/[excId]
 *   Body: { action: "approve" | "reject",
 *           approved_max_margin_dollars?: number,
 *           review_note?: string }
 *
 * Approve captures the max margin the exception permits so the
 * server-side pricing validator can enforce it later.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ excId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { excId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const reviewNote = typeof body.review_note === "string" ? body.review_note.trim() : "";

  const { data: exc } = await supabaseAdmin
    .from("machine_listing_pricing_exceptions")
    .select("id, machine_listing_id, requested_margin_cents, status")
    .eq("id", excId)
    .maybeSingle();
  if (!exc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (exc.status !== "pending") {
    return NextResponse.json({ error: "This exception has already been decided." }, { status: 409 });
  }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (action === "reject" && !reviewNote) {
    return NextResponse.json({ error: "A review note is required to reject." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  let approvedMaxMarginCents: number | null = null;
  if (action === "approve") {
    // Default cap = the requested margin, unless admin wants to cap
    // higher (e.g., a shared exception that grants the manufacturer
    // flexibility to change price further later).
    const raw = body.approved_max_margin_dollars;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      approvedMaxMarginCents = Math.round(raw * 100);
    } else {
      approvedMaxMarginCents = exc.requested_margin_cents;
    }
  }

  const { error } = await supabaseAdmin
    .from("machine_listing_pricing_exceptions")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      approved_max_margin_cents: approvedMaxMarginCents,
      review_note: reviewNote || null,
      reviewed_by: user.id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", excId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: `pricing_exception_${action}`,
      entity_type: "machine_listing_pricing_exception",
      entity_id: excId,
      metadata: { approved_max_margin_cents: approvedMaxMarginCents },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ status: action === "approve" ? "approved" : "rejected" });
}
