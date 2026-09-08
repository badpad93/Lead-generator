/**
 * Hard-delete safety for sales_orders.
 *
 * A sales_order that carries durable commercial history — an invoice that
 * has gone out, a canonical financial-spine link or a public.invoices row,
 * a purchase agreement the customer has already seen (sent / viewed /
 * partially_signed / signed / countersigned / executed) or that is a
 * permanent cancelled record, a payment, or any status past a disposable
 * draft — must never be hard deleted.
 *
 * Deleting such a row is destructive far beyond the row itself:
 *   - order_items         ON DELETE CASCADE  -> line items vanish
 *   - order_activity_log  ON DELETE CASCADE  -> audit trail vanishes
 *   - purchase_agreements ON DELETE SET NULL -> agreements are silently
 *                                               orphaned into dangerous
 *                                               standalone signing artifacts
 *
 * This is exactly how Order #108 (UUID c7b55fca-…) was lost: an elevated
 * user hit DELETE /api/sales/orders/[id], which had no commercial-history
 * guard, so the invoiced order was hard-deleted, its items and activity
 * cascaded away, and both its agreements were left order_id = NULL.
 *
 * This module is PURE and env-free so it unit-tests without a database.
 * The route gathers the evidence and calls assessOrderDeletable(); a block
 * becomes a 409 with a precise reason and NO rows are touched.
 */

export interface OrderDeleteEvidence {
  orderStatus?: string | null;
  invoiceStatus?: string | null;
  paymentStatus?: string | null;
  financialSpineInvoiceId?: string | null;
  /** A public.invoices row exists for this order. */
  hasCanonicalInvoiceRow?: boolean;
  /** agreement_status of every purchase_agreements row linked to this order. */
  agreementStatuses?: Array<string | null | undefined>;
}

export interface DeleteAssessment {
  deletable: boolean;
  /** Machine-readable block reason; undefined when deletable. */
  reason?: string;
}

/** Invoice states that mean money has already been billed. */
export const PROTECTED_INVOICE_STATUSES = new Set(["sent", "paid"]);

/** Agreement states the customer has already seen, or that are a
 *  permanent record — none may be silently orphaned by a delete. */
export const PROTECTED_AGREEMENT_STATUSES = new Set([
  "sent",
  "viewed",
  "partially_signed",
  "signed",
  "countersigned",
  "executed",
  "cancelled",
]);

/** The only order state with no commercial history — safe to delete. */
export const DISPOSABLE_ORDER_STATUSES = new Set(["draft"]);

const lower = (v: unknown): string => String(v ?? "").toLowerCase();

/** The blocking checks, most-durable first, so a 409 names the strongest
 *  evidence. Each returns a machine-readable reason, or null when it passes.
 *  Kept as a table so the assessment itself stays flat (lint complexity). */
const DELETE_BLOCKERS: Array<(e: OrderDeleteEvidence) => string | null> = [
  (e) => (PROTECTED_INVOICE_STATUSES.has(lower(e.invoiceStatus)) ? `invoice_${lower(e.invoiceStatus)}` : null),
  (e) => (e.financialSpineInvoiceId ? "financial_spine_linked" : null),
  (e) => (e.hasCanonicalInvoiceRow ? "invoice_row_exists" : null),
  (e) => {
    const blocked = (e.agreementStatuses ?? []).map(lower).find((s) => PROTECTED_AGREEMENT_STATUSES.has(s));
    return blocked ? `agreement_${blocked}` : null;
  },
  (e) => (lower(e.paymentStatus) && lower(e.paymentStatus) !== "unpaid" ? `payment_${lower(e.paymentStatus)}` : null),
  (e) => (lower(e.orderStatus) && !DISPOSABLE_ORDER_STATUSES.has(lower(e.orderStatus)) ? `order_status_${lower(e.orderStatus)}` : null),
];

/**
 * Decide whether an order may be hard deleted. Returns the FIRST blocking
 * reason found (most-durable first), so the 409 names the strongest evidence.
 */
export function assessOrderDeletable(e: OrderDeleteEvidence): DeleteAssessment {
  for (const blocker of DELETE_BLOCKERS) {
    const reason = blocker(e);
    if (reason) return { deletable: false, reason };
  }
  return { deletable: true };
}

/** Human-readable message for a 409 response. */
export function deleteBlockMessage(reason: string): string {
  return (
    `This order has durable commercial history (${reason}) and cannot be deleted. ` +
    `Cancel or supersede it instead so its invoice, agreement and audit trail are preserved.`
  );
}
