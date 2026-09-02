import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/sales/orders/[id]/locations/[locId]/secure
 *
 * Flip a sourced location to 'secured'. The pricing snapshot
 * (tier, tier_label, secured_price) was already stamped at attach
 * time from the lead's pricing engine result, so this endpoint no
 * longer asks the rep to pick a tier or a price. It just:
 *   - marks the row secured (secured_at / secured_by)
 *   - applies the pro-rata deposit credit
 *   - optionally fires the remaining-balance invoice when the
 *     secured count hits the order's locations_purchased quota
 *
 * Deposit credit: deposit_amount / locations_purchased per row,
 * capped at secured_price. Informational — the remaining-balance
 * invoice sums (Σ secured_price − deposit_amount) at bill time
 * regardless of per-row credit.
 */

interface SecureBody {
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
    .select("id, order_id, status, business_name, tier_label, secured_price")
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
  const securedPrice = Number(row.secured_price);
  if (!Number.isFinite(securedPrice) || securedPrice <= 0) {
    return NextResponse.json(
      {
        error:
          "This location has no pricing snapshot — detach and re-attach it so the pricing engine can run against the lead's inputs.",
      },
      { status: 409 },
    );
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, deposit_amount, locations_purchased")
    .eq("id", id)
    .maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const depositAmount = Number(order.deposit_amount) || 0;
  const quota = Number(order.locations_purchased) || 0;
  const perLocationCredit = quota > 0 ? depositAmount / quota : 0;
  const creditApplied = Math.min(perLocationCredit, securedPrice);

  const nowIso = new Date().toISOString();
  const { data: updated, error: updErr } = await supabaseAdmin
    .from("sales_order_locations")
    .update({
      status: "secured",
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
    description: `Location secured: ${row.business_name} — ${row.tier_label ?? "Tier"} @ $${securedPrice.toFixed(2)} (deposit credit $${creditApplied.toFixed(2)})`,
  });

  // Auto-invoice when the secured count hits the quota. Opt-out
  // via auto_invoice=false; the manual "Invoice remaining balance"
  // button on the panel serves the same route on demand.
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
