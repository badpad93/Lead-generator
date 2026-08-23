import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

/**
 * POST /api/admin/manufacturers/equipment/[eqId]
 *   Body: { action: "approve" | "reject" | "request_changes" |
 *                     "activate" | "deactivate",
 *           reason?: string,
 *           final_price_dollars?: number  // for admin price adjustment
 *         }
 *
 * Approving publishes the equipment (status → 'active'). Admin may
 * adjust the final Vending Connector price WITHOUT changing the
 * wholesale price, per the agreement.
 */

const NEXT_STATUS: Record<string, string> = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
  activate: "active",
  deactivate: "inactive",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eqId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { eqId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const priceRaw = body.final_price_dollars;

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, manufacturer_partner_id, status, wholesale_price_cents, buy_now_price")
    .eq("id", eqId)
    .maybeSingle();
  if (!listing || !listing.manufacturer_partner_id) {
    return NextResponse.json({ error: "Not a manufacturer listing." }, { status: 404 });
  }

  const nextStatus = NEXT_STATUS[action];
  if (!nextStatus) {
    return NextResponse.json({ error: `Unknown action ${action}.` }, { status: 400 });
  }
  if ((action === "reject" || action === "request_changes") && !reason) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: nextStatus === "approved" ? "active" : nextStatus,
    admin_notes: reason || null,
    updated_at: nowIso,
  };

  // Admin price adjustment — brief allows this WITHOUT changing the
  // manufacturer sale price. Re-enforce final >= wholesale.
  if (typeof priceRaw === "number" && Number.isFinite(priceRaw) && priceRaw > 0) {
    const newFinalCents = Math.round(priceRaw * 100);
    if (listing.wholesale_price_cents != null && newFinalCents < listing.wholesale_price_cents) {
      return NextResponse.json(
        { error: "Adjusted price cannot be less than the manufacturer sale price." },
        { status: 400 },
      );
    }
    patch.buy_now_price = priceRaw;
    patch.asking_price = priceRaw;
    patch.buy_now_enabled = true;
  }

  const { error } = await supabaseAdmin
    .from("machine_listings")
    .update(patch)
    .eq("id", eqId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: `manufacturer_equipment_${action}`,
      entity_type: "machine_listing",
      entity_id: eqId,
      before: {
        status: listing.status,
        buy_now_price: listing.buy_now_price,
      },
      after: patch,
      reason: reason || null,
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ status: patch.status });
}
