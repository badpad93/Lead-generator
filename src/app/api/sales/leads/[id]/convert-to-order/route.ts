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
 *   // BUYER — required when the lead is a LOCATION (entity_type=
 *   // 'location'). A location is the commodity being sold, not the
 *   // customer; the order bills the OPERATOR buying the placement.
 *   operator_account_id?: string      // existing sales_accounts id
 *   operator?: {                      // or create/resolve the buyer
 *     business_name?: string, contact_name?: string,
 *     email?: string, phone?: string,
 *   }
 *
 * Behavior:
 *   - Resolves the buyer account: for location leads that's the
 *     operator from the body; for operator/other leads it's the
 *     lead itself via the shared resolver (unchanged).
 *   - Runs calculateLocationPrice() to determine per-location fee.
 *     10/10/10 orders override to a flat $400 and skip the deposit.
 *   - Inserts a sales_orders row (order_type='location_services',
 *     document_type='order', order_status='draft').
 *   - Inserts one order_items row for the location_services line.
 *   - For location leads, also attaches the location to the order's
 *     sales_order_locations (the Sourced Locations panel) with the
 *     pricing snapshot — the location rides on the order as the
 *     commodity, never as the recipient.
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

  // Resolve the BUYER account. Two shapes:
  //
  //   Location lead (entity_type='location') — the location is the
  //   COMMODITY. The order must bill an operator, so the caller has
  //   to name one: an existing sales_accounts id, or contact fields
  //   we resolve/create through the shared resolver. Using the
  //   location's own contact as the buyer (the old behavior) put
  //   the product on the invoice as the customer.
  //
  //   Any other lead — the lead IS the buyer; resolver path
  //   unchanged.
  const isLocationLead = lead.entity_type === "location";
  const operatorAccountId =
    typeof body.operator_account_id === "string" ? body.operator_account_id : null;
  const operatorInput = (body.operator ?? null) as {
    business_name?: string;
    contact_name?: string;
    email?: string;
    phone?: string;
  } | null;

  let accountId: string | null = null;
  let recipientEmail: string | null = null;

  if (isLocationLead) {
    if (!operatorAccountId && !operatorInput?.business_name && !operatorInput?.email) {
      return NextResponse.json(
        {
          error:
            "This is a location lead — the location is what's being sold. Select the operator account buying it, or enter the operator's info.",
          code: "OPERATOR_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (operatorAccountId) {
      const { data: acct } = await supabaseAdmin
        .from("sales_accounts")
        .select("id, email")
        .eq("id", operatorAccountId)
        .maybeSingle();
      if (!acct) {
        return NextResponse.json({ error: "Operator account not found" }, { status: 404 });
      }
      accountId = acct.id;
      recipientEmail = (acct as { email: string | null }).email ?? null;
    } else {
      try {
        const { findOrCreateSalesAccount } = await import("@/lib/salesAccountResolver");
        const resolved = await findOrCreateSalesAccount({
          business_name: operatorInput?.business_name ?? null,
          contact_name: operatorInput?.contact_name ?? null,
          email: operatorInput?.email ?? null,
          phone: operatorInput?.phone ?? null,
          address: null,
        });
        accountId = resolved.id;
        recipientEmail = operatorInput?.email ?? null;
      } catch (e) {
        console.error("[convert-to-order] operator account resolve failed:", e);
        return NextResponse.json(
          { error: "Could not create the operator account" },
          { status: 500 },
        );
      }
    }
  } else {
    accountId = lead.account_id ?? null;
    recipientEmail = lead.email || null;
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
    recipient_email: recipientEmail,
    // For location leads the notes name the commodity so the order
    // reads correctly at a glance: operator buys, location is sold.
    notes: isLocationLead
      ? `Location placement sale — sourcing ${lead.business_name}${lead.address ? ` (${lead.address})` : ""} for the operator on this order.${lead.notes ? `\n${lead.notes}` : ""}`
      : lead.notes || null,
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

  // Location leads ride on the order as the COMMODITY: attach the
  // location to the Sourced Locations panel with the pricing
  // snapshot already computed above, mirroring what
  // /api/sales/orders/[id]/locations (attach) stamps. Non-fatal —
  // the rep can attach from the panel if this insert hiccups.
  if (isLocationLead) {
    try {
      await supabaseAdmin.from("sales_order_locations").insert({
        order_id: orderId,
        lead_id: lead.id,
        business_name: lead.business_name,
        contact_name: lead.contact_name ?? null,
        contact_email: lead.email ?? null,
        contact_phone: lead.phone ?? null,
        address: lead.address ?? null,
        city: lead.city ?? null,
        state: lead.state ?? null,
        zip: lead.zip_code ?? null,
        machine_count: lead.machine_count ?? 1,
        machine_type: lead.machine_type ?? null,
        tier: isTenTenTen ? null : pricing.tier,
        tier_label: pricing.tier_label,
        secured_price: perLocation,
        attached_by: user.id,
      });
    } catch (e) {
      console.error("[convert-to-order] sourced-location attach failed (non-fatal):", e);
    }
  }

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
