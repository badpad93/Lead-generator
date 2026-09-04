/**
 * The sales flow, as a state machine.
 *
 * There is exactly one path from "a rep opened a quote" to "the team is
 * fulfilling an order", and it has two buttons:
 *
 *   1. draft quote        -> [ Next ]                          -> quote_sent
 *   2. quote_sent         -> [ Process Order & Send Invoice ]  -> awaiting_payment
 *   3. awaiting_payment   -> (no button; waiting on the customer)
 *   4. paid               -> (no button; handed to workflows)
 *
 * Step 2 is one call to /api/sales/orders/[id]/process, which converts
 * the quote, generates the agreement from the line items, emails it for
 * signature, and sends the invoice.
 *
 * This replaces a seven-verb sequence — send_quote, convert_to_order,
 * generate_agreement, send_agreement, send_invoice, mark_deposit_paid,
 * mark_paid — where every step was a separate chance to stop halfway
 * and leave an order that looked complete but had no contract behind
 * it. The intermediate transitions still exist on
 * /api/sales/orders/[id]/status for webhooks and admin repair; they are
 * simply not part of the rep's path any more.
 *
 * Nothing here reads a stored next_required_action column. That column
 * was set once by hand and went stale immediately; state is derived
 * from the order's actual columns on every read.
 */

export interface OrderForNextAction {
  document_type?: string | null;
  order_status?: string | null;
  order_type?: string | null;
  is_ten_ten_ten?: boolean | null;
  order_items?: Array<{ item_type?: string | null }>;
  invoice_status?: string | null;
  agreement_status?: string | null;
  deposit_amount?: number | string | null;
  total_value?: number | string | null;
}

/**
 * Every order gets a written agreement.
 *
 * This used to return true only for coffee sales and 10/10/10 packages,
 * testing `item_type === 'coffee_program'` — a value the storefront
 * mirror never wrote, so real coffee orders were excluded from the very
 * gate meant to catch them. The agreement now tailors its schedules to
 * whatever is on the order, so there is nothing left to gate on.
 *
 * Kept as an exported function because callers still ask the question;
 * the answer is now always yes.
 */
export function orderNeedsAgreement(_order?: OrderForNextAction): boolean {
  return true;
}

export type NextStepVerb = "send_quote" | "process_order";

export interface NextStep {
  verb: NextStepVerb;
  buttonLabel: string;
  /** Nudge text shown beside the button. */
  copy: string;
}

export type FlowStage =
  | "building"
  | "quote_out"
  | "awaiting_payment"
  | "in_fulfillment"
  | "closed";

export interface FlowState {
  stage: FlowStage;
  /** Short status line, e.g. "Waiting on customer payment". */
  headline: string;
  /** One sentence of detail under the headline. */
  detail: string;
  /** The single action available here, or null when the flow is waiting. */
  action: NextStep | null;
}

const PAID_STATUSES = new Set([
  "paid",
  "deposit_paid",
  "machine_ordered",
  "location_search_active",
  "coffee_program_setup",
  "shipped",
  "delivered",
]);

/**
 * The one thing that can happen next, or null when the flow is waiting
 * on someone outside the CRM.
 */
export function deriveNextStep(order: OrderForNextAction): NextStep | null {
  return deriveFlowState(order).action;
}

export function deriveFlowState(order: OrderForNextAction): FlowState {
  const status = order.order_status ?? "draft";
  const isQuote = order.document_type !== "order";
  const hasItems = (order.order_items?.length ?? 0) > 0;

  if (status === "completed") {
    return {
      stage: "closed",
      headline: "Order complete",
      detail: "Nothing outstanding on this order.",
      action: null,
    };
  }

  if (status === "cancelled") {
    return {
      stage: "closed",
      headline: "Order cancelled",
      detail: "This order was cancelled and is no longer in the flow.",
      action: null,
    };
  }

  // Paid — the customer's part is done and the work belongs to the
  // team now. The workflow spawns automatically off the payment event
  // (see src/lib/workflows/paymentSync.ts), so there is nothing for the
  // rep to click.
  if (PAID_STATUSES.has(status)) {
    return {
      stage: "in_fulfillment",
      headline: "Paid — sent to workflows",
      detail:
        "Payment received. The order has been handed to the fulfillment workflow; the team picks it up from there.",
      action: null,
    };
  }

  // The invoice and agreement are out. Waiting on the customer.
  if (
    status === "awaiting_payment" ||
    status === "invoice_sent" ||
    status === "order_sent" ||
    status === "agreement_sent" ||
    status === "awaiting_signature"
  ) {
    const signed = order.agreement_status === "signed";
    return {
      stage: "awaiting_payment",
      headline: "Order processed, invoice sent — waiting on customer payment",
      detail: signed
        ? "The agreement is signed. The order moves on by itself as soon as payment lands."
        : "The agreement is out for signature and the invoice has been sent. The order moves on by itself as soon as payment lands.",
      action: null,
    };
  }

  // The quote is with the customer. One button turns it into a live
  // order: convert, generate the agreement from the line items, send it
  // for signature, and invoice.
  if (status === "quote_sent") {
    return {
      stage: "quote_out",
      headline: "Quote sent — waiting on the customer to accept",
      detail:
        "When the customer accepts, this one step converts the quote to an order, sends the agreement for signature, and invoices them.",
      action: {
        verb: "process_order",
        buttonLabel: "Process Order & Send Invoice",
        copy: "Convert to an order, send the agreement for signature, and send the invoice",
      },
    };
  }

  // Draft. The only thing that needs doing is the line items.
  return {
    stage: "building",
    headline: hasItems ? "Ready to send" : "Add line items",
    detail: hasItems
      ? "Send the quote to the customer. Everything after that is one more click."
      : "Add the line items this customer is buying. That is the only thing this flow needs from you.",
    action: hasItems
      ? {
          verb: "send_quote",
          buttonLabel: "Next",
          copy: isQuote
            ? "Send the quote to the customer"
            : "Send this order to the customer",
        }
      : null,
  };
}

/** Banner text. Kept as its own export because the orders list renders
 *  it without the button. */
export function deriveNextAction(order: OrderForNextAction): string | null {
  const state = deriveFlowState(order);
  if (state.stage === "closed") return null;
  return state.headline;
}
