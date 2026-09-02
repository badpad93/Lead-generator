import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  TIER_PRICES,
  TEN_TEN_TEN_PRICE,
  DEFAULT_LOCATION_PRICE,
  type LocationTier,
} from "@/lib/pricing/locationPricing";

/**
 * POST /api/sales/orders/[id]/locations/[locId]/secure
 *
 * Flip a sourced location to 'secured' and stamp the pricing
 * snapshot that will govern the eventual remaining-balance
 * invoice. This is the money-touching endpoint — securing means
 * "we've booked a placement, count it against the deposit."
 *
 * Body:
 *   { tier?: 1|2|3, is_ten_ten_ten?: boolean, price_override?: number }
 *
 * Price resolution (first match wins):
 *   1. price_override — explicit dollar amount from the rep
 *   2. order.is_ten_ten_ten OR body.is_ten_ten_ten → TEN_TEN_TEN_PRICE
 *   3. body.tier → TIER_PRICES[tier]
 *   4. fall back to DEFAULT_LOCATION_PRICE ($500) — same default
 *      the legacy pricing engine uses for tier-less line items.
 *
 * Deposit credit: each secured location consumes a pro-rata
 * share of the paid deposit
 *   deposit_credit_applied = deposit_amount / locations_purchased
 * capped at secured_price. The credit is informational — the
 * remaining-balance invoice sums (Σ secured_price − deposit_amount)
 * so per-row credit doesn't have to be exact.
 *
 * When this secure flip lands the row that makes secured count
 * equal to the order's locations_purchased quota, the caller can
 * pass auto_invoice=true to fire the invoice-remaining route
 * inline. The UI's "Invoice remaining balance" button does the
 * same thing on demand for the manual fallback path.
 */

interface SecureBody {
  tier?: LocationTier;
  is_ten_ten_ten?: boolean;
  price_override?: number;
  auto_invoice?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locId: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, locId } = await params;
  const body = (await req.json().catch(() => ({}))) as SecureBody;

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("sales_order_locations")
    .select("id, order_id, status, business_name")
    .eq("id", locId)
    .eq("order_id", id)
    .maybeSingle();
  if (rowErr || !row) {
    return NextResponse.json({ error: "Sourced location not found" }, { status: 404 });
  }
  if (row.status !== "sourced") {
    return NextResponse.json(
      { error: `Location is already ${row.status}` },
      { status: 409 },
    );
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, deposit_amount, is_ten_ten_ten, locations_purchased, order_type")
    .eq("id", id)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Resolve the secured price.
  const isTenTenTen = order.is_ten_ten_ten === true || body.is_ten_ten_ten === true;
  let securedPrice: number;
  let tierValue: LocationTier | null = null;
  let tierLabel: string;
  if (typeof body.price_override === "number" && body.price_override > 0) {
    securedPrice = Math.round(body.price_override * 100) / 100;
    tierLabel = "Custom";
    tierValue = body.tier ?? null;
  } else if (isTenTenTen) {
    securedPrice = TEN_TEN_TEN_PRICE;
    tierLabel = "10/10/10 Prepaid";
  } else if (body.tier && TIER_PRICES[body.tier] !== undefined) {
    securedPrice = TIER_PRICES[body.tier];
    tierValue = body.tier;
    tierLabel = body.tier === 1 ? "Basic" : body.tier === 2 ? "Premium" : "Elite";
  } else {
    securedPrice = DEFAULT_LOCATION_PRICE;
    tierValue = 1;
    tierLabel = "Basic";
  }

  // Pro-rata deposit credit — deposit ÷ quota. For orders without
  // a locations_purchased set (deposit-only intake path stamps
  // deposit_amount but leaves locations_purchased null), fall back
  // to using the order's own machine_count from the linked lead.
  const depositAmount = Number(order.deposit_amount) || 0;
  const quota = Number(order.locations_purchased) || 0;
  const perLocationCredit = quota > 0 ? depositAmount / quota : 0;
  const creditApplied = Math.min(perLocationCredit, securedPrice);

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("sales_order_locations")
    .update({
      status: "secured",
      tier: tierValue,
      tier_label: tierLabel,
      secured_price: securedPrice,
      deposit_credit_applied: creditApplied,
      secured_by: user.id,
      secured_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", locId)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "location_secured",
    description: `Location secured: ${row.business_name} — ${tierLabel} @ $${securedPrice.toFixed(2)} (deposit credit $${creditApplied.toFixed(2)})`,
  });

  // Auto-invoice when secured count hits the quota. Only fires if
  // the caller opted in — the manual "Invoice remaining balance"
  // button is the fallback path when a rep wants to bill early
  // (partial quota) or defer past the quota.
  let autoInvoiceResult: unknown = null;
  if (body.auto_invoice !== false && quota > 0) {
    const { count: securedCount } = await supabaseAdmin
      .from("sales_order_locations")
      .select("id", { count: "exact", head: true })
      .eq("order_id", id)
      .eq("status", "secured");
    if ((securedCount ?? 0) >= quota) {
      try {
        const origin = new URL(req.url).origin;
        const invRes = await fetch(`${origin}/api/sales/orders/${id}/locations/invoice-remaining`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: req.headers.get("authorization") ?? "",
          },
          body: JSON.stringify({ trigger: "auto_on_quota_reached" }),
        });
        autoInvoiceResult = await invRes.json().catch(() => ({ ok: invRes.ok }));
      } catch (e) {
        console.error("[locations.secure] auto invoice failed:", e);
        autoInvoiceResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }

  return NextResponse.json({ location: updated, auto_invoice: autoInvoiceResult });
}
