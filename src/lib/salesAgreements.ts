import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_LOCATION_PRICE } from "@/lib/pricing/locationPricing";
import { orderNeedsAgreement } from "@/lib/salesOrderNextAction";

/**
 * THE one way a purchase agreement is created from an order or quote.
 *
 * Quotes, orders, and agreements each live on their own page, but
 * agreements have exactly ONE set of rails: /sales/agreements +
 * /api/sales/agreements. This helper is called by that API (and by
 * the legacy order-scoped POST, which now just delegates here) so
 * there is a single snapshot/derivation implementation — the
 * previous duplicate creation path produced diverging scalar values
 * depending on which button a rep clicked.
 */
export class AgreementCreationError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "AgreementCreationError";
  }
}

const FREIGHT_NAME = /freight|shipping/i;

export async function createAgreementFromOrder(input: {
  orderId: string;
  userId: string;
}): Promise<Record<string, unknown>> {
  const { orderId, userId } = input;

  // Fetch the order with account and line items
  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) throw new AgreementCreationError(404, "Order not found");

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
    throw new AgreementCreationError(
      409,
      "Agreements are only for coffee sales or 10/10/10 package orders. This order qualifies for neither.",
      "AGREEMENT_NOT_REQUIRED",
    );
  }

  // Look up the assigned rep's profile
  const { data: repProfile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", order.assigned_rep_id || order.created_by)
    .single();

  // --- Derive equipment info from order_items ---
  const machineItems = items.filter((i) => i.item_type === "machine_sale");
  const machineQuantity = machineItems.reduce(
    (sum, i) => sum + (Number(i.quantity) || 1),
    0,
  );
  const machineUnitPrice =
    machineItems.length > 0
      ? Number(machineItems[0].unit_price) || Number(machineItems[0].price) || 3700
      : 3700;
  // Pricing continuity: the subtotal comes from the lines' actual
  // total_price (which carries any discount_percent), NOT qty × raw
  // unit price — recomputing from the unit price silently stripped
  // line discounts every time an agreement was generated.
  const equipmentSubtotal = machineItems.reduce(
    (sum, i) =>
      sum +
      (Number(i.total_price) ||
        (Number(i.quantity) || 1) * (Number(i.unit_price) || Number(i.price) || 0)),
    0,
  );
  const machineModel =
    machineItems.length > 0
      ? String(machineItems[0].service_name || machineItems[0].description || "VendEra AI Machine")
      : "VendEra AI Machine";

  // --- Location services ---
  const locationItems = items.filter((i) => i.item_type === "location_services");
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
  // Pricing continuity: if the order/quote ALREADY carries
  // freight/shipping lines (any item type — reps enter freight as
  // "other", and catalog freight items are sometimes typed
  // coffee_program), the agreement MUST inherit their exact total.
  // The $350/machine default applies only when no freight line
  // exists at all.
  const freightItems = items.filter(
    (i) =>
      i.item_type !== "machine_sale" &&
      i.item_type !== "location_services" &&
      FREIGHT_NAME.test(String(i.service_name || "")),
  );
  const freightFromItems = freightItems.reduce(
    (sum, i) =>
      sum +
      (Number(i.total_price) ||
        (Number(i.quantity) || 1) * (Number(i.unit_price) || Number(i.price) || 0)),
    0,
  );
  const freightTotal =
    freightItems.length > 0 ? freightFromItems : 350 /* default rate */ * machineQuantity;
  const freightPerMachine =
    machineQuantity > 0 ? Math.round((freightTotal / machineQuantity) * 100) / 100 : freightTotal;

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

  // Coffee-supply gate. A coffee_program line means a brewer/supply
  // relationship the customer must sign the Equipment Loan &
  // Beverage Supply Agreement for — EXCEPT freight lines that reps
  // or the catalog happen to type as coffee_program ("Coffee
  // Machine Freight" is shipping, not a brewer, and must not drag
  // the supply agreement into the contract).
  const coffeeSupplyRequired = items.some(
    (i) =>
      i.item_type === "coffee_program" &&
      !FREIGHT_NAME.test(String(i.service_name || "")),
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
        "[salesAgreements] coffee_program line on order but no active coffee_supply agreement_templates row — supply agreement snapshot will be null",
      );
    }
  }

  const agreementPayload = {
    order_id: orderId,
    account_id: order.account_id || null,
    created_by: userId,
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

    // Freight / shipping. EVERY freight field reflects the inherited
    // line-item rate — leaving standard/discounted unset let the DB
    // defaults ($500/$375 from migration 087) leak into the contract
    // text as phantom rates that disagreed with the quote and order.
    freight_per_machine: freightPerMachine,
    freight_total: freightTotal,
    standard_freight_rate: freightPerMachine,
    discounted_freight_rate: freightPerMachine,
    // Storage is not a line item anywhere in the quote/order flow, so
    // the agreement must not charge one. Re-introduce via the item
    // catalog if the storage program comes back.
    storage_fee_per_machine_month: 0,

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

  if (insertErr) throw new AgreementCreationError(500, insertErr.message);

  // Log activity
  await supabaseAdmin.from("agreement_activity_log").insert({
    agreement_id: (agreement as { id: string }).id,
    user_id: userId,
    activity_type: "created",
    description: "Agreement created from order",
  });

  return agreement as Record<string, unknown>;
}
