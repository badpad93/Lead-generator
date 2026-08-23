import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { releaseManufacturerPayoutIfReady } from "@/lib/manufacturerPayouts";

/**
 * PATCH /api/manufacturer/me/orders/[id]
 *
 * Single endpoint for all manufacturer-side fulfillment transitions.
 * Body: { action, ...args }
 *
 *   action="acknowledge"
 *     Marks new → acknowledged. Records acknowledged_at.
 *
 *   action="ship"
 *     Body: { carrier, tracking_number, serial_numbers?, estimated_ship_date?, fulfillment_notes? }
 *     Marks fulfillment_status='shipped' + stamps shipped_at.
 *     Triggers the two-gate payout release check.
 *
 *   action="mark_delivered"
 *     Marks 'delivered'. Terminal for fulfillment lifecycle.
 *
 *   action="report_issue"
 *     Body: { issue_reason }
 *     Marks fulfillment_status='issue' with the reason on file.
 *
 *   action="update_notes"
 *     Body: { fulfillment_notes, estimated_ship_date? }
 *     Notes-only update — no lifecycle change.
 *
 * Every action verifies purchase.manufacturer_partner_id === auth
 * user. Returns 404 (not 403) on ownership mismatch to avoid
 * disclosing existence.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: purchase } = await supabaseAdmin
    .from("machine_listing_purchases")
    .select("id, manufacturer_partner_id, fulfillment_status, shipped_at, payment_settled_at, manufacturer_payout_status")
    .eq("id", id)
    .maybeSingle();
  if (!purchase || purchase.manufacturer_partner_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: nowIso };

  switch (action) {
    case "acknowledge": {
      if (purchase.fulfillment_status !== "new") {
        return NextResponse.json({ error: `Cannot acknowledge from ${purchase.fulfillment_status}.` }, { status: 400 });
      }
      patch.fulfillment_status = "acknowledged";
      patch.acknowledged_at = nowIso;
      break;
    }
    case "ship": {
      const carrier = typeof body.carrier === "string" ? body.carrier.trim() : "";
      const tracking = typeof body.tracking_number === "string" ? body.tracking_number.trim() : "";
      if (!carrier || !tracking) {
        return NextResponse.json(
          { error: "Carrier and tracking / freight PRO number are required to mark shipped." },
          { status: 400 },
        );
      }
      if (
        purchase.fulfillment_status !== "acknowledged" &&
        purchase.fulfillment_status !== "processing" &&
        purchase.fulfillment_status !== "new"
      ) {
        return NextResponse.json({ error: `Cannot ship from ${purchase.fulfillment_status}.` }, { status: 400 });
      }
      patch.fulfillment_status = "shipped";
      patch.carrier = carrier;
      patch.tracking_number = tracking;
      patch.shipped_at = nowIso;
      const eta = typeof body.estimated_ship_date === "string" ? body.estimated_ship_date : null;
      if (eta && /^\d{4}-\d{2}-\d{2}$/.test(eta)) patch.estimated_ship_date = eta;
      if (Array.isArray(body.serial_numbers)) {
        patch.serial_numbers = (body.serial_numbers as unknown[])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim());
      }
      if (typeof body.fulfillment_notes === "string") {
        patch.fulfillment_notes = body.fulfillment_notes.trim() || null;
      }
      break;
    }
    case "mark_delivered": {
      if (purchase.fulfillment_status !== "shipped") {
        return NextResponse.json({ error: `Cannot mark delivered from ${purchase.fulfillment_status}.` }, { status: 400 });
      }
      patch.fulfillment_status = "delivered";
      patch.delivered_at = nowIso;
      break;
    }
    case "report_issue": {
      const reason = typeof body.issue_reason === "string" ? body.issue_reason.trim() : "";
      if (!reason) {
        return NextResponse.json({ error: "Please describe the issue." }, { status: 400 });
      }
      patch.fulfillment_status = "issue";
      patch.issue_reason = reason;
      break;
    }
    case "update_notes": {
      if (typeof body.fulfillment_notes === "string") {
        patch.fulfillment_notes = body.fulfillment_notes.trim() || null;
      }
      if (typeof body.estimated_ship_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.estimated_ship_date)) {
        patch.estimated_ship_date = body.estimated_ship_date;
      }
      break;
    }
    default:
      return NextResponse.json({ error: `Unknown action ${action}.` }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("machine_listing_purchases")
    .update(patch)
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire the payout check whenever shipping happens. Idempotent —
  // if the payment hasn't settled yet the helper stamps
  // 'awaiting_gates' and returns; when payment settles later, the
  // admin mark-payment-settled endpoint calls the same helper.
  if (action === "ship") {
    try {
      await releaseManufacturerPayoutIfReady(id);
    } catch (payoutErr) {
      console.error("[manufacturer/orders] payout release failed:", payoutErr);
    }
  }

  return NextResponse.json({ ok: true, fulfillment_status: patch.fulfillment_status });
}
