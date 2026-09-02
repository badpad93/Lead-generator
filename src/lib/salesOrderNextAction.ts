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

/**
 * Machine-readable version of deriveNextAction. Returns the single
 * next-step BUTTON — verb (matches the STATUS_ACTIONS map at
 * /api/sales/orders/[id]/status/route.ts), label, and copy that
 * doubles as the banner text. UI renders ONE button per state so
 * a rep can't stray off the linear quote → order → agreement →
 * invoice → paid → fulfill → complete path.
 *
 * `verb` values:
 *   "send_quote"          — /api/sales/orders/[id]/send  (isQuote)
 *   "convert_to_order"    — /api/sales/orders/[id]/convert-to-order
 *   "generate_agreement"  — /api/sales/orders/[id]/agreement (POST)
 *   "send_agreement"      — /api/sales/orders/[id]/status action=send_agreement
 *   "send_invoice"        — /api/sales/orders/[id]/send OR status=send_invoice
 *   "mark_deposit_paid"   — /api/sales/orders/[id]/status
 *   "mark_paid"           — /api/sales/orders/[id]/status
 *   "mark_machine_ordered" — /api/sales/orders/[id]/status
 *   "mark_shipped"        — /api/sales/orders/[id]/status
 *   "mark_delivered"      — /api/sales/orders/[id]/status
 *   "mark_completed"      — /api/sales/orders/[id]/status
 *   null                  — nothing to do (terminal state or unknown)
 */
export type NextStepVerb =
  | "send_quote"
  | "convert_to_order"
  | "generate_agreement"
  | "send_agreement"
  | "send_invoice"
  | "mark_deposit_paid"
  | "mark_paid"
  | "mark_machine_ordered"
  | "mark_shipped"
  | "mark_delivered"
  | "mark_completed";

export interface NextStep {
  verb: NextStepVerb;
  buttonLabel: string;
  copy: string; // longer nudge text for the banner
}

export function deriveNextStep(order: OrderForNextAction): NextStep | null {
  const status = order.order_status ?? "draft";
  const isQuote = order.document_type === "quote";
  const isLocationServicesOnly = order.order_type === "location_services";
  const needsAgreement = orderNeedsAgreement(order);

  // Terminal states — no button.
  if (status === "completed" || status === "cancelled") return null;

  // Draft — the whole point of a draft is to fill items + send.
  if (status === "draft" || status === "awaiting_customer_info" || status === null) {
    return isQuote
      ? {
          verb: "send_quote",
          buttonLabel: "Send Quote",
          copy: "Fill in customer info + line items, then send the quote",
        }
      : {
          verb: "send_invoice",
          buttonLabel: "Send Invoice",
          copy: "Fill in customer info + line items, then send the invoice",
        };
  }

  // Quote sent → next step is convert to order (customer said yes)
  if (status === "quote_sent") {
    return {
      verb: "convert_to_order",
      buttonLabel: "Convert to Order",
      copy: "Customer accepted the quote — convert it to an order",
    };
  }

  // Order emailed via Resend fallback (no real invoice) → send the real invoice.
  if (status === "order_sent") {
    return {
      verb: "send_invoice",
      buttonLabel: "Send Invoice",
      copy: "Send the QuickBooks invoice so the customer can pay",
    };
  }

  // For an active order (post-quote conversion, pre-agreement) that
  // NEEDS an agreement, gate on the agreement step first — nothing
  // else happens until the agreement is generated + sent + signed.
  if (needsAgreement && status !== "awaiting_signature" && status !== "agreement_sent") {
    // No agreement created yet at this stage: agreement generation
    // is the actual next physical step even if status is invoice_sent
    // or awaiting_payment.
    if (
      status === "invoice_sent" ||
      status === "awaiting_payment" ||
      status === "deposit_paid" ||
      status === "paid"
    ) {
      // Order has advanced; agreement should have happened by now.
      // Emit the "generate" button as the correcting nudge.
      return {
        verb: "generate_agreement",
        buttonLabel: "Generate Agreement",
        copy: "This order needs a signed agreement — generate it and send for signature",
      };
    }
  }

  if (status === "invoice_sent") {
    return {
      verb: "mark_deposit_paid",
      buttonLabel: isLocationServicesOnly ? "Mark Paid" : "Mark Deposit Paid",
      copy: isLocationServicesOnly
        ? "Deposit received — mark paid to move to fulfillment"
        : "Deposit received — mark deposit paid",
    };
  }

  if (status === "awaiting_payment") {
    return {
      verb: "mark_deposit_paid",
      buttonLabel: isLocationServicesOnly ? "Mark Paid" : "Mark Deposit Paid",
      copy: isLocationServicesOnly
        ? "Payment received — mark paid"
        : "Deposit payment received — mark deposit paid",
    };
  }

  if (status === "deposit_paid") {
    if (isLocationServicesOnly) {
      // Location-only orders skip a "collect remaining balance" step.
      return {
        verb: "mark_paid",
        buttonLabel: "Mark Paid",
        copy: "Location services deposit is the full payment — mark paid",
      };
    }
    return {
      verb: "mark_paid",
      buttonLabel: "Mark Paid",
      copy: "Remaining balance collected — mark paid",
    };
  }

  if (status === "paid") {
    if (needsAgreement) {
      return {
        verb: "generate_agreement",
        buttonLabel: "Generate Agreement",
        copy: "Payment complete — generate the purchase agreement and send for signature",
      };
    }
    return {
      verb: "mark_machine_ordered",
      buttonLabel: "Process Order",
      copy: "Payment complete — order machine(s) from supplier",
    };
  }

  if (status === "agreement_sent") {
    return {
      verb: "send_agreement",
      buttonLabel: "Resend Agreement",
      copy: "Waiting on customer signature — resend the agreement if needed",
    };
  }

  if (status === "awaiting_signature") {
    return {
      verb: "send_agreement",
      buttonLabel: "Resend Agreement",
      copy: "Waiting on customer signature — resend the agreement if needed",
    };
  }

  if (status === "machine_ordered") {
    return {
      verb: "mark_shipped",
      buttonLabel: "Mark Shipped",
      copy: "Machine has shipped — mark shipped",
    };
  }

  if (status === "shipped") {
    return {
      verb: "mark_delivered",
      buttonLabel: "Mark Delivered",
      copy: "Machine delivered — mark delivered",
    };
  }

  if (status === "delivered") {
    return {
      verb: "mark_completed",
      buttonLabel: "Mark Completed",
      copy: "Delivery confirmed — mark completed",
    };
  }

  // Fulfillment states without a clear single next step — no button,
  // rep uses the activity log to track.
  return null;
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
