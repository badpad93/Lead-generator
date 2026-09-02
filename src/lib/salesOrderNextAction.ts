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
  // invoice_status distinguishes "agreement was signed and we're
  // waiting to send the invoice" from "invoice went out, waiting on
  // the deposit." Both land at order_status='awaiting_payment' today,
  // so the next-step derivation needs invoice_status to pick the
  // correct button. Values: null / 'not_sent' / 'sent' / 'paid'.
  invoice_status?: string | null;
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
  | "source_locations"
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

  // Quote sent — the customer accepted. Branch on whether this
  // sale type needs a signed agreement:
  //   coffee OR 10/10/10 → Generate Agreement first (the signed
  //     agreement is the actual commitment; the order flip happens
  //     downstream when the agreement is marked signed).
  //   otherwise → Convert to Order directly.
  if (status === "quote_sent") {
    if (needsAgreement) {
      return {
        verb: "generate_agreement",
        buttonLabel: "Generate Agreement",
        copy: "Customer accepted the quote — generate the agreement and send for signature. The quote flips to an order automatically when the agreement is signed.",
      };
    }
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

  // In the new flow agreements are generated BEFORE the quote is
  // converted to an order, so a post-conversion order that needs
  // an agreement should be impossible via the linear path. The
  // corrective nudge that used to live here for that legacy state
  // is intentionally gone — if a rep somehow gets there via manual
  // status editing, the natural derivations below still apply.

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
    // awaiting_payment lands here two ways:
    //   1. Agreement was marked signed (STATUS_ACTIONS sets
    //      order_status='awaiting_payment' on mark_agreement_signed).
    //      In this case, invoice_status is likely 'not_sent' or null
    //      because the customer hasn't been invoiced yet.
    //   2. Invoice was already sent and we're waiting on the
    //      deposit (invoice_status='sent').
    // Split the next step accordingly so the button matches reality.
    const invoiceOut =
      order.invoice_status === "sent" || order.invoice_status === "paid";
    if (!invoiceOut) {
      return {
        verb: "send_invoice",
        buttonLabel: "Send Invoice",
        copy: "Agreement signed — send the invoice so the customer can pay",
      };
    }
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
    // Location-services orders don't have machines to order — the
    // deposit is a placement-service deposit and the next physical
    // step is sourcing locations. Every other paid order proceeds
    // to "order machine(s) from supplier."
    if (isLocationServicesOnly) {
      return {
        verb: "source_locations",
        buttonLabel: "Source Locations",
        copy: "Deposit received — start sourcing locations. Link a location lead or add one manually below; each secured location applies against the deposit.",
      };
    }
    // Agreement is upstream in the new flow — a 'paid' state
    // implies the agreement (if required) has already been signed,
    // so the next physical step is always fulfillment.
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
    // Location-services orders have no machine to order — the
    // deposit is a placement-service deposit and the physical
    // next step is sourcing locations. Every other paid order
    // proceeds to machine procurement. Matches the split in
    // deriveNextStep() so the yellow banner and the emerald
    // Next Step card agree on what the rep should do next.
    if (isLocationServicesOnly) return "Start sourcing locations — link a lead or add one manually";
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
