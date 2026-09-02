import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { DEFAULT_LOCATION_PRICE } from "@/lib/pricing/locationPricing";
import { orderNeedsAgreement } from "@/lib/salesOrderNextAction";

/* ------------------------------------------------------------------ */
/*  POST — Create a purchase agreement from an order                  */
/* ------------------------------------------------------------------ */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  // Fetch the order with account and line items
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order)
    return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const account = order.sales_accounts;
  const items: Array<Record<string, unknown>> = order.order_items || [];

  // Gate: purchase_agreements exist only for the two sale types that
  // legally need a written agreement:
  //   1. Coffee sales (Equipment Loan & Beverage Supply Agreement
  //      required — a coffee_program line on the order means a
  //      brewer/supply relationship the customer must sign for)
  //   2. 10/10/10 package sales (is_ten_ten_ten=true — the
  //      10-machine / 10-location / 10-year financing bundle
  //      that has its own terms)
  // Generic machine-only sales do NOT get an agreement. Refuse
  // creation here so a rep can't accidentally spin one up and then
  // send it to a customer who wasn't supposed to sign anything.
  // The UI also hides the button in these cases, but this is the
  // authoritative check.
  if (!orderNeedsAgreement(order as Parameters<typeof orderNeedsAgreement>[0])) {
    return NextResponse.json(
      {
        error:
          "Agreements are only for coffee sales or 10/10/10 package orders. This order qualifies for neither.",
        code: "AGREEMENT_NOT_REQUIRED",
      },
      { status: 409 },
    );
  }

  // Look up the assigned rep's profile
  const { data: repProfile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", order.assigned_rep_id || order.created_by)
    .single();

  // --- Derive equipment info from order_items ---
  const machineItems = items.filter(
    (i) => i.item_type === "machine_sale",
  );
  const machineQuantity = machineItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 1),
    0,
  );
  const machineUnitPrice =
    machineItems.length > 0
      ? Number(machineItems[0].unit_price) || Number(machineItems[0].price) || 3700
      : 3700;
  const equipmentSubtotal = machineQuantity * machineUnitPrice;
  const machineModel =
    machineItems.length > 0
      ? String(machineItems[0].service_name || machineItems[0].description || "VendEra AI Machine")
      : "VendEra AI Machine";

  // --- Location services ---
  const locationItems = items.filter(
    (i) => i.item_type === "location_services",
  );
  const locationsPurchased = locationItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 1),
    0,
  );
  // Fall back to the Basic tier price (shared with the marketplace
  // operator fee) instead of the legacy $400 hardcode. Real line
  // items always carry a unit_price computed by the pricing engine.
  const locationFeePerSecured =
    locationItems.length > 0
      ? Number(locationItems[0].unit_price) || Number(locationItems[0].price) || DEFAULT_LOCATION_PRICE
      : DEFAULT_LOCATION_PRICE;
  const maxLocationServiceValue = locationsPurchased * locationFeePerSecured;

  // --- Freight ---
  const freightPerMachine = 350; // default rate
  const freightTotal = freightPerMachine * machineQuantity;

  // --- Totals ---
  const totalDuePriorToProcurement = equipmentSubtotal + freightTotal;

  // Full line-item snapshot — every order_items row verbatim so
  // coffee/cooler/financing/other lines survive the conversion.
  // The scalar columns above (machine_quantity, equipment_subtotal
  // etc.) stay populated for backwards compat but this is the
  // authoritative source of truth going forward. Copy shape kept
  // deliberately shallow so a future PATCH can round-trip cleanly.
  const lineItemsSnapshot = items.map((i) => ({
    item_type: i.item_type ?? null,
    service_name: i.service_name ?? null,
    description: i.description ?? null,
    quantity: i.quantity ?? null,
    unit_price: i.unit_price ?? i.price ?? null,
    discount_percent: i.discount_percent ?? null,
    total_price: i.total_price ?? null,
    deposit_required: i.deposit_required ?? null,
    location_deposit_amount: i.location_deposit_amount ?? null,
    location_service_price: i.location_service_price ?? null,
    product_id: i.product_id ?? null,
  }));

  // Coffee-supply gate. If any coffee_program line is on the order,
  // this agreement covers a brewer/supply relationship and the
  // customer must accept the Equipment Loan & Beverage Supply
  // Agreement. Snapshot the currently-active coffee_supply template
  // onto the row so the customer signs a specific, immutable
  // version — if the template is updated later, historical
  // agreements preserve what was actually agreed to.
  const coffeeSupplyRequired = items.some(
    (i) => i.item_type === "coffee_program",
  );
  let coffeeSupplySnapshot: Record<string, unknown> | null = null;
  if (coffeeSupplyRequired) {
    const { data: tpl } = await supabaseAdmin
      .from("agreement_templates")
      .select("id, agreement_type, version, title, content_html, content_hash, effective_date")
      .eq("agreement_type", "coffee_supply")
      .eq("is_active", true)
      .maybeSingle();
    if (tpl) {
      const t = tpl as {
        id: string;
        agreement_type: string;
        version: number;
        title: string;
        content_html: string;
        content_hash: string | null;
        effective_date: string | null;
      };
      coffeeSupplySnapshot = {
        template_id: t.id,
        agreement_type: t.agreement_type,
        version: t.version,
        title: t.title,
        content_html: t.content_html,
        content_hash: t.content_hash,
        effective_date: t.effective_date,
        captured_at: new Date().toISOString(),
      };
    } else {
      // No active coffee_supply template — this is a data/config
      // problem the admin needs to fix, but don't block agreement
      // creation. Record required=true; the UI surfaces the missing
      // snapshot as a banner so the sales team knows to escalate.
      console.warn(
        "[orders/agreement] coffee_program line on order but no active coffee_supply agreement_templates row — supply agreement snapshot will be null",
      );
    }
  }

  const agreementPayload = {
    order_id: orderId,
    account_id: order.account_id || null,
    created_by: user.id,
    agreement_status: "draft",
    agreement_type: "machine_purchase",

    // Operator info from account
    operator_company_name: account?.business_name || "",
    operator_legal_name: account?.contact_name || "",
    operator_email: account?.email || order.recipient_email || "",
    operator_phone: account?.phone || "",
    operator_billing_address: account?.address || "",
    operator_delivery_address: account?.address || "",

    // Apex representative
    apex_representative_name: repProfile?.full_name || "",
    apex_representative_email: repProfile?.email || "",

    // Equipment (legacy scalars — see line_items_snapshot for the
    // full, non-lossy record)
    machine_model: machineModel,
    machine_quantity: machineQuantity || 1,
    machine_unit_price: machineUnitPrice,
    equipment_subtotal: equipmentSubtotal,

    // Location services
    locations_purchased: locationsPurchased,
    location_fee_per_secured: locationFeePerSecured,
    max_location_service_value: maxLocationServiceValue,

    // Freight / shipping
    freight_per_machine: freightPerMachine,
    freight_total: freightTotal,

    // Payment
    total_due_prior_to_procurement: totalDuePriorToProcurement,

    // Dates
    effective_date: new Date().toISOString().slice(0, 10),

    // Full snapshot + coffee-supply attachment
    line_items_snapshot: lineItemsSnapshot,
    coffee_supply_required: coffeeSupplyRequired,
    coffee_supply_snapshot: coffeeSupplySnapshot,
  };

  const { data: agreement, error: insertErr } = await supabaseAdmin
    .from("purchase_agreements")
    .insert(agreementPayload)
    .select("*")
    .single();

  if (insertErr)
    return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: agreement.id,
    user_id: user.id,
    activity_type: "created",
    description: "Agreement created from order",
  });

  return NextResponse.json(agreement, { status: 201 });
}

/* ------------------------------------------------------------------ */
/*  GET — List agreements for an order                                */
/* ------------------------------------------------------------------ */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: orderId } = await params;

  const { data: agreements, error } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each agreement with initials/signature counts
  const enriched = await Promise.all(
    (agreements || []).map(async (ag) => {
      const [{ count: initialsCount }, { count: signaturesCount }] =
        await Promise.all([
          supabaseAdmin
            .from("agreement_initials")
            .select("*", { count: "exact", head: true })
            .eq("agreement_id", ag.id),
          supabaseAdmin
            .from("agreement_signatures")
            .select("*", { count: "exact", head: true })
            .eq("agreement_id", ag.id),
        ]);

      return {
        ...ag,
        initials_count: initialsCount ?? 0,
        signatures_count: signaturesCount ?? 0,
      };
    }),
  );

  return NextResponse.json(enriched);
}
