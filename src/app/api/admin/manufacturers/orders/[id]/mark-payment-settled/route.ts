import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { releaseManufacturerPayoutIfReady } from "@/lib/manufacturerPayouts";

const ADMIN_ROLES = new Set(["admin", "director_of_sales", "market_leader"]);

/**
 * POST /api/admin/manufacturers/orders/[id]/mark-payment-settled
 *
 * Admin flags a manufacturer purchase as "customer payment cleared to
 * VC". Stamps payment_settled_at and calls the payout release helper —
 * if the manufacturer has already marked the order shipped, this
 * triggers the Dwolla transfer immediately (two-gate release).
 *
 * Intended for manual reconciliation until Stripe / QB webhooks are
 * wired to auto-flip this flag.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || !ADMIN_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { data: purchase } = await supabaseAdmin
    .from("machine_listing_purchases")
    .select("id, manufacturer_partner_id, payment_settled_at")
    .eq("id", id)
    .maybeSingle();
  if (!purchase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!purchase.manufacturer_partner_id) {
    return NextResponse.json({ error: "Not a manufacturer purchase." }, { status: 400 });
  }
  if (purchase.payment_settled_at) {
    return NextResponse.json({ ok: true, already: true });
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("machine_listing_purchases")
    .update({ payment_settled_at: nowIso, updated_at: nowIso })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = await releaseManufacturerPayoutIfReady(id);

  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: user.id,
      action: "manufacturer_purchase_payment_settled",
      entity_type: "machine_listing_purchase",
      entity_id: id,
      metadata: { payout_result: result.status },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, payout: result });
}
