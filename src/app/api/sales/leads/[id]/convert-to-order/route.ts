import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import {
  calculateLocationPrice,
  TIER_PRICES,
  TEN_TEN_TEN_PRICE,
} from "@/lib/pricing/locationPricing";

/**
 * POST /api/sales/leads/[id]/convert-to-order
 *
 * The "Convert to Order" button on the Leads page. Skips the old
 * pipelines/deals path entirely — creates a sales_orders row and a
 * seeded location_services line item so the rep can send the
 * order/quote from /sales/orders/[id] immediately.
 *
 * Body:
 *   is_ten_ten_ten?: boolean          // customer took the prepaid deal
 *   num_locations?: number            // defaults to 1
 *   pricing?: {                       // optional overrides for the engine
 *     employees?: number,
 *     foot_traffic?: number,
 *     business_hours?: "low"|"medium"|"high"|"24/7",
 *     machines_requested?: 1|2|3|4
 *   }
 *
 * Behavior:
 *   - Finds or creates a sales_accounts row via the shared resolver.
 *   - Runs calculateLocationPrice() to determine per-location fee.
 *     10/10/10 orders override to a flat $400 and skip the deposit.
 *   - Inserts a sales_orders row (order_type='location_services',
 *     document_type='order', order_status='draft').
 *   - Inserts one order_items row for the location_services line.
 *   - Flips the lead to status='qualified'.
 *   - Returns { order_id, mode: "hard"|"soft" } — client redirects
 *     to /sales/orders/[order_id].
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: leadId } = await params;
  const body = await req.json().catch(() => ({}));

  const isTenTenTen = !!body.is_ten_ten_ten;
  const numLocations = Math.max(1, Math.min(Number(body.num_locations) || 1, 200));
  const pricingOverrides = (body.pricing ?? {}) as {
    employees?: number;
    foot_traffic?: number;
    business_hours?: "low" | "medium" | "high" | "24/7";
    machines_requested?: 1 | 2 | 3 | 4;
  };

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("sales_leads")
    .select("*")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Find or create the sales_accounts row through the shared resolver
  // so normalized email/name/phone matching is consistent.
  let accountId: string | null = lead.account_id ?? null;
  if (!accountId) {
    try {
      const { findOrCreateSalesAccount } = await import("@/lib/salesAccountResolver");
      const resolved = await findOrCreateSalesAccount({
        business_name: lead.business_name,
        contact_name: lead.contact_name,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
      });
      accountId = resolved.id;
    } catch (e) {
      console.error("[convert-to-order] account resolver failed:", e);
    }
  }

  // Pricing engine call. If the caller didn't send scoring inputs,
  // fall back to safe defaults so we still produce a Basic tier price.
  const pricing = calculateLocationPrice({
    employees: Number(pricingOverrides.employees ?? 0) || 0,
    foot_traffic: Number(pricingOverrides.foot_traffic ?? 0) || 0,
    business_hours: pricingOverrides.business_hours ?? "medium",
    machines_requested: pricingOverrides.machines_requested ?? 1,
    is_ten_ten_ten: isTenTenTen,
  });

  const perLocation = pricing.price;
  const lineTotal = perLocation * numLocations;
  const depositPerLocation = isTenTenTen ? 0 : 100;
  const depositTotal = depositPerLocation * numLocations;

  // Insert the sales_orders row. document_type + order_type live on
  // the extended schema (migration 082, 085). is_ten_ten_ten is new
  // (migration 164) — retried without the column if the migration
  // hasn't run yet so lead conversion still works.
  const orderBase = {
    lead_id: leadId,
    account_id: accountId,
    created_by: user.id,
    assigned_rep_id: lead.assigned_to || user.id,
    document_type: "order" as const,
    order_type: "location_services" as const,
    order_status: "draft" as const,
    status: "draft" as const,
    total_value: lineTotal,
    deposit_amount: depositTotal,
    deposit_paid: false,
    remaining_balance: lineTotal - depositTotal,
    payment_status: "unpaid" as const,
    invoice_status: "not_sent" as const,
    agreement_status: "not_sent" as const,
    fulfillment_status: "pending" as const,
    recipient_email: lead.email || null,
    notes: lead.notes || null,
  };
  let orderInsert = await supabaseAdmin
    .from("sales_orders")
    .insert({ ...orderBase, is_ten_ten_ten: isTenTenTen })
    .select("id")
    .single();
  if (orderInsert.error && /is_ten_ten_ten/i.test(orderInsert.error.message)) {
    orderInsert = await supabaseAdmin
      .from("sales_orders")
      .insert(orderBase)
      .select("id")
      .single();
  }
  if (orderInsert.error || !orderInsert.data) {
    return NextResponse.json(
      { error: `Order create failed: ${orderInsert.error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  const orderId = orderInsert.data.id;

  // Seed the location_services line item so the order isn't empty.
  const description = isTenTenTen
    ? `Location services (10/10/10 prepaid — flat $${TEN_TEN_TEN_PRICE}/location)`
    : `Location services (${pricing.tier_label} — $${TIER_PRICES[pricing.tier]}/location)`;
  await supabaseAdmin
    .from("order_items")
    .insert({
      order_id: orderId,
      service_name: "Location Services",
      description,
      item_type: "location_services",
      quantity: numLocations,
      unit_price: perLocation,
      price: perLocation,
      total_price: lineTotal,
      status: "pending",
      // The deposit-required fields exist on the line item too
      // (migration 082). Kept in sync with sales_orders.deposit_*.
      deposit_required: !isTenTenTen,
      location_service_price: perLocation,
      location_deposit_amount: depositPerLocation,
      location_deposit_paid: false,
      location_remaining_balance: perLocation - depositPerLocation,
    });

  // Flip the lead to qualified so it exits the New Leads view.
  await supabaseAdmin
    .from("sales_leads")
    .update({ status: "qualified" })
    .eq("id", leadId);

  // Best-effort activity log.
  try {
    await supabaseAdmin.from("order_activity_log").insert({
      order_id: orderId,
      user_id: user.id,
      activity_type: "created_from_lead",
      description: `Converted from lead ${leadId}${isTenTenTen ? " (10/10/10 prepaid)" : ""}`,
    });
  } catch {
    /* non-fatal */
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    account_id: accountId,
    pricing: {
      tier: pricing.tier,
      tier_label: pricing.tier_label,
      per_location: perLocation,
      num_locations: numLocations,
      line_total: lineTotal,
      deposit_total: depositTotal,
      is_ten_ten_ten: isTenTenTen,
    },
  });
}
