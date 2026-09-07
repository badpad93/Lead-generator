/**
 * Commerce quote row shapes (mirror migration 20260907221654) and the
 * typed error every quote route/tool converts to an HTTP or tool error.
 */
export type QuoteStatus = "draft" | "confirmed" | "checkout_pending" | "invoiced" | "paid" | "expired" | "cancelled";
export type FinancingStatus = "none" | "interested" | "application_started" | "application_submitted";
export type AgreementState = "not_required" | "required_missing" | "satisfied";
export type LinePricingBasis = "catalog_fixed" | "catalog_per_location" | "no_charge" | "coffee_list" | "coffee_tier" | "coffee_storefront";
export type LineValidationStatus =
  | "valid"
  | "price_changed"
  | "inactive"
  | "unavailable"
  | "requires_agreement"
  | "requires_qualification"
  | "mapping_missing"
  | "tax_unset"
  | "location_intake";

export interface QuoteRow {
  id: string;
  user_id: string;
  thread_id: string | null;
  quote_number: string;
  status: QuoteStatus;
  currency: "USD";
  version: number;
  confirmed_version: number | null;
  confirmed_at: string | null;
  expires_at: string | null;
  financing_program: "standard" | "ten_ten_ten" | null;
  financing_status: FinancingStatus;
  financing_application_id: string | null;
  financing_interest_at: string | null;
  agreement_state: AgreementState;
  subtotal: number;
  tax_status: "pre_tax" | "qbo_calculated" | "exempt";
  total: number;
  qb_customer_id: string | null;
  qb_invoice_id: string | null;
  qb_invoice_doc_number: string | null;
  qb_invoice_status: "none" | "created" | "sent" | "paid" | "void";
  checkout_status: "none" | "blocked" | "link_issued" | "paid" | "failed";
  checkout_url: string | null;
  checkout_idempotency_key: string | null;
  checkout_started_at: string | null;
  checkout_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteLineRow {
  id: string;
  quote_id: string;
  source_type: "catalog_item" | "coffee_product";
  catalog_item_id: string | null;
  coffee_product_id: string | null;
  catalog_key: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  pricing_basis: LinePricingBasis;
  parent_line_id: string | null;
  is_auto_add_on: boolean;
  validation_status: LineValidationStatus;
  staff_determination_by: string | null;
  staff_determination_at: string | null;
  staff_determination_note: string | null;
  sort_order: number;
}

export type QuoteErrorCode =
  | "authentication_required"
  | "write_tools_disabled"
  | "checkout_disabled"
  | "not_found"
  | "invalid_operation"
  | "item_not_quotable"
  | "quantity_invalid"
  | "quote_locked"
  | "version_mismatch"
  | "quote_expired"
  | "checkout_blocked"
  | "upstream_error";

const STATUS_BY_CODE: Record<QuoteErrorCode, number> = {
  authentication_required: 401,
  write_tools_disabled: 403,
  checkout_disabled: 403,
  not_found: 404,
  invalid_operation: 422,
  item_not_quotable: 422,
  quantity_invalid: 422,
  quote_locked: 409,
  version_mismatch: 409,
  quote_expired: 409,
  checkout_blocked: 409,
  upstream_error: 502,
};

export class QuoteError extends Error {
  readonly code: QuoteErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;
  constructor(code: QuoteErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "QuoteError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isQuoteError(e: unknown): e is QuoteError {
  return e instanceof QuoteError;
}

/** What changed between the stored snapshot and a fresh server read. */
export interface QuoteChange {
  kind: "price_changed" | "unavailable" | "inactive" | "add_on_adjusted" | "deposit_waived" | "line_removed";
  description: string;
  previous: number | null;
  current: number | null;
}

export const QUOTE_EXPIRY_DAYS = 7;
export const MAX_LINE_QUANTITY = 999;
export const MAX_QUOTE_LINES = 25;
