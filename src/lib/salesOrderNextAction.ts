/**
 * Derive the next required action for a sales_orders row from its
 * actual state, not from a stored free-text column.
 *
 * The old shape kept a `next_required_action` text column on
 * sales_orders that a rep set once (via a browser prompt) and then
 * never updated. It went stale immediately and lied to everyone
 * downstream. This helper replaces it: given the current order
 * state, it returns the single next-step string the CRM row + the
 * detail-page banner should display.
 *
 * Order precedence matters — we return the FIRST step that hasn't
 * happened yet, walking the natural CRM lifecycle in order. So a
 * paid order that hasn't been fulfilled shows "Order machine from
 * supplier," not "Send invoice."
 *
 * The order_status column is the authoritative signal because it's
 * written by every status-transition route AND by the /send route
 * (see /api/sales/orders/[id]/send/route.ts and
 * /api/sales/orders/[id]/status/route.ts). If a row lands in a
 * status this helper doesn't recognize, return null — the UI
 * hides the banner rather than showing wrong copy.
 */

export interface OrderForNextAction {
  document_type?: string | null;
  order_status?: string | null;
  order_type?: string | null;
  is_ten_ten_ten?: boolean | null;
  order_items?: Array<{ item_type?: string | null }>;
}

/**
 * Whether an order is eligible for a purchase_agreement. Per
 * business rule, agreements only exist for coffee sales OR 10/10/10
 * package sales; a generic machine sale doesn't get a written
 * agreement. Kept here so the next-action derivation can decide
 * whether to prompt "Convert to agreement."
 */
export function orderNeedsAgreement(order: OrderForNextAction): boolean {
  if (order.is_ten_ten_ten === true) return true;
  const items = order.order_items ?? [];
  return items.some((i) => i.item_type === "coffee_program");
}

export function deriveNextAction(order: OrderForNextAction): string | null {
  const status = order.order_status ?? "draft";
  const isQuote = order.document_type === "quote";
  const isLocationServicesOnly = order.order_type === "location_services";
  const needsAgreement = orderNeedsAgreement(order);

  // Terminal states — nothing to nudge.
  if (status === "completed" || status === "cancelled") return null;

  // Draft / brand-new — same nudge whether quote or order.
  if (status === "draft" || status === "awaiting_customer_info" || status === null) {
    return isQuote
      ? "Fill in customer info + line items, then send the quote"
      : "Fill in customer info + line items, then send the order";
  }

  // Quote sent — nudge the natural quote → order flip.
  if (status === "quote_sent") {
    return "Follow up with the customer. Convert to order when they're ready to buy.";
  }

  // Order emailed, no real invoice yet (Resend fallback).
  if (status === "order_sent") {
    return "Send the QuickBooks invoice so the customer can pay";
  }

  // Real QBO invoice out the door.
  if (status === "invoice_sent") {
    return "Follow up on payment";
  }

  // Awaiting payment covers deposit + full-pay cases.
  if (status === "awaiting_payment") {
    return isLocationServicesOnly
      ? "Follow up on deposit — no remaining balance for location-only orders"
      : "Follow up on deposit payment";
  }

  if (status === "deposit_paid") {
    if (isLocationServicesOnly) return "Find and confirm location(s)";
    return "Collect remaining balance";
  }

  if (status === "paid") {
    if (needsAgreement) return "Convert to agreement and get it signed";
    return "Order machine(s) from supplier";
  }

  // Agreement lifecycle.
  if (status === "agreement_sent") {
    return "Follow up on signature";
  }
  if (status === "awaiting_signature") {
    return "Follow up on signature";
  }

  // Fulfillment.
  if (status === "machine_ordered") return "Schedule shipment";
  if (status === "location_search_active") return "Find and confirm location(s)";
  if (status === "coffee_program_setup") return "Complete coffee program setup";
  if (status === "shipped") return "Confirm delivery";
  if (status === "delivered") return "Mark completed";

  return null;
}
