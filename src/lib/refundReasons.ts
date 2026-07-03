/**
 * Structured refund reason codes — one hardcoded list keeps reporting clean,
 * a free-text "notes" field on the payment captures the rest.
 */

export const REFUND_REASONS = [
  { code: "customer_request", label: "Customer request" },
  { code: "duplicate_payment", label: "Duplicate payment" },
  { code: "service_not_delivered", label: "Service not delivered" },
  { code: "fraud", label: "Fraud" },
  { code: "chargeback_response", label: "Chargeback response" },
  { code: "admin_correction", label: "Admin correction" },
  { code: "other", label: "Other" },
] as const;

export type RefundReasonCode = (typeof REFUND_REASONS)[number]["code"];

export function isValidRefundReason(code: unknown): code is RefundReasonCode {
  return typeof code === "string" && REFUND_REASONS.some((r) => r.code === code);
}
