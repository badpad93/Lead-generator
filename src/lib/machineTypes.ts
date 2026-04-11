/**
 * Marketplace machine catalog types.
 *
 * These mirror the rows in the `machines` and `machine_orders`
 * tables created in supabase/migrations/023 and 024.
 */

export interface Machine {
  id: string;
  slug: string;
  name: string;
  model: string | null;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  price_cents: number;
  finance_estimate_monthly_cents: number | null;
  finance_term_years: number;
  finance_rate_label: string;
  machine_type: string | null;
  features: string[];
  specs: Record<string, unknown>;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type PurchaseType = "cash" | "finance";

export type BundleType =
  | "machine_only"
  | "machine_plus_location"
  | "machine_plus_finance"
  | "full_package";

export type MachineOrderStatus =
  | "pending_review"
  | "under_review"
  | "approved"
  | "in_fulfillment"
  | "completed"
  | "cancelled";

export interface MachineOrder {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  company_name: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  machine_id: string | null;
  machine_name: string;
  machine_slug: string | null;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
  purchase_type: PurchaseType;
  financing_requested: boolean;
  estimated_monthly_cents: number | null;
  location_services_selected: boolean;
  location_services_quote_min_cents: number | null;
  location_services_quote_max_cents: number | null;
  bundle_type: BundleType;
  agreement_version: string | null;
  agreement_text: string | null;
  accepted_terms: boolean;
  referring_rep_id: string | null;
  referring_rep_name: string | null;
  status: MachineOrderStatus;
  admin_notes: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}

export const LOCATION_SERVICES_MIN_CENTS = 30000; // $300
export const LOCATION_SERVICES_MAX_CENTS = 120000; // $1,200

export const MACHINE_ORDER_STATUS_LABELS: Record<MachineOrderStatus, string> = {
  pending_review: "Pending Review",
  under_review: "Under Review",
  approved: "Approved",
  in_fulfillment: "In Fulfillment",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const BUNDLE_TYPE_LABELS: Record<BundleType, string> = {
  machine_only: "Machine Only",
  machine_plus_location: "Machine + Location Services",
  machine_plus_finance: "Machine + Financing",
  full_package: "Full Package (Machine + Finance + Location)",
};

/** Derive bundle_type from the two bundle flags. */
export function deriveBundleType(
  financingRequested: boolean,
  locationServicesSelected: boolean
): BundleType {
  if (financingRequested && locationServicesSelected) return "full_package";
  if (financingRequested) return "machine_plus_finance";
  if (locationServicesSelected) return "machine_plus_location";
  return "machine_only";
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
