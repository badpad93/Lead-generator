import type { QuoteChange, QuoteLineRow, QuoteRow } from "./quoteTypes";

/**
 * Customer- and model-facing projection of a quote. Contains no
 * QuickBooks identifiers, no checkout URL (the Checkout button obtains
 * that from its own authenticated route), and no internal columns.
 */
export interface CheckoutReadiness {
  available: boolean;
  /** Structured reasons the Checkout button is not offered. */
  blocked_reasons: Array<{ code: string; message: string; line_id?: string }>;
  /** Deposit lines follow the existing location-request process. */
  location_intake_quantity: number;
}

export interface QuoteView {
  quote_id: string;
  quote_number: string;
  status: QuoteRow["status"];
  version: number;
  currency: "USD";
  subtotal: number;
  total: number;
  tax_status: QuoteRow["tax_status"];
  tax_note: string;
  expires_at: string | null;
  confirmed_at: string | null;
  financing: { program: QuoteRow["financing_program"]; status: QuoteRow["financing_status"] };
  agreement_state: QuoteRow["agreement_state"];
  lines: Array<{
    line_id: string;
    ref: string;
    source_type: QuoteLineRow["source_type"];
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    pricing_basis: QuoteLineRow["pricing_basis"];
    is_auto_add_on: boolean;
    parent_line_id: string | null;
    validation_status: QuoteLineRow["validation_status"];
    staff_determined: boolean;
  }>;
  changes: QuoteChange[];
  notices: string[];
  checkout: CheckoutReadiness;
}

export const TAX_NOTE = "Prices are pre-tax. Tax is calculated on the final QuickBooks invoice.";

const LINE_NOTICE: Partial<Record<QuoteLineRow["validation_status"], string>> = {
  requires_qualification: "Requires a recorded staff determination before it can be checked out.",
  location_intake: "Deposit lines are collected through the existing location-request process.",
  inactive: "This item is no longer available and will be removed from the total.",
  unavailable: "This item is currently unavailable.",
  price_changed: "The public price changed since this quote was built.",
};

export function quoteNotices(quote: QuoteRow, lines: QuoteLineRow[]): string[] {
  const out = new Set<string>();
  for (const l of lines) {
    const n = LINE_NOTICE[l.validation_status];
    if (n) out.add(n);
  }
  if (quote.financing_status !== "none") out.add("Financing interest is recorded on this quote. It does not reduce the amount due and is not an approval, rate, or term.");
  if (quote.status === "expired") out.add("This quote expired. Rebuild it to get current prices.");
  return [...out];
}

export function toQuoteView(quote: QuoteRow, lines: QuoteLineRow[], changes: QuoteChange[], checkout: CheckoutReadiness): QuoteView {
  return {
    quote_id: quote.id,
    quote_number: quote.quote_number,
    status: quote.status,
    version: quote.version,
    currency: "USD",
    subtotal: quote.subtotal,
    total: quote.total,
    tax_status: quote.tax_status,
    tax_note: TAX_NOTE,
    expires_at: quote.expires_at,
    confirmed_at: quote.confirmed_at,
    financing: { program: quote.financing_program, status: quote.financing_status },
    agreement_state: quote.agreement_state,
    lines: lines.map((l) => ({
      line_id: l.id,
      ref: l.catalog_key ?? l.coffee_product_id ?? l.catalog_item_id ?? "",
      source_type: l.source_type,
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      pricing_basis: l.pricing_basis,
      is_auto_add_on: l.is_auto_add_on,
      parent_line_id: l.parent_line_id,
      validation_status: l.validation_status,
      staff_determined: !!l.staff_determination_at,
    })),
    changes,
    notices: quoteNotices(quote, lines),
    checkout,
  };
}
