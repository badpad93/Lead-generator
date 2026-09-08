/**
 * Guard for the sign-time "auto-create order + send invoice" path.
 *
 * When a purchase agreement is fully signed, generateAgreementPdf has two
 * downstream branches:
 *   - LINKED order (ag.order_id set): sync the order and fire the invoice
 *     via sendInvoiceForSignedAgreement, which is idempotent (it refuses to
 *     double-invoice when invoice_status is sent/paid, a financial-spine
 *     link exists, or a public.invoices row exists).
 *   - NO linked order (ag.order_id null): autoCreateOrderAndSendInvoice
 *     mints a BRAND-NEW sales_order + order_items + invoice. This is the
 *     legitimate e-sign-from-scratch flow.
 *
 * The no-order branch is dangerous for an agreement that was ORPHANED by
 * order deletion (FK ON DELETE SET NULL leaves order_id null on an
 * agreement that used to be linked). If such an agreement is a REPLACEMENT
 * of a prior deal (created via the supersession/reissue path, which logs
 * activity_type 'created_as_replacement' and, for already-invoiced orders,
 * sets auto_send_invoice_on_signing = false), auto-creating a fresh order +
 * invoice on signing would duplicate the original order and its invoice.
 *
 * This decision is PURE and env-free so it unit-tests without a database.
 * The caller supplies whether the agreement is a replacement (a lightweight
 * activity-log lookup) alongside the flags already on the agreement row.
 */

export interface AutoCreateOnSignInput {
  isLocationPlacement: boolean;
  autoSendInvoiceOnSigning: boolean;
  /** ag.order_id is set (the agreement is linked to an existing order). */
  hasLinkedOrder: boolean;
  /** The agreement supersedes a prior deal (reissue/supersession path). */
  isReplacement: boolean;
}

/**
 * True only for the legitimate e-sign-from-scratch case: a machine-purchase
 * agreement with auto-invoice enabled, no linked order, and which is NOT a
 * replacement of an existing deal. Every other combination must not mint a
 * new order + invoice on signing.
 */
export function shouldAutoCreateOrderOnSign(input: AutoCreateOnSignInput): boolean {
  if (input.isLocationPlacement) return false;
  if (!input.autoSendInvoiceOnSigning) return false;
  if (input.hasLinkedOrder) return false;
  if (input.isReplacement) return false;
  return true;
}
