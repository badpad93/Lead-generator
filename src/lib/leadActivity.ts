import { isElevatedRole, canSeeTeamAssignedLeads, type SalesRole } from "@/lib/salesRoles";

/**
 * Lead-owner customer activity.
 *
 * A sales rep who owns a lead (sales_leads.assigned_to) should see that
 * customer's orders, quotes, and agreements. The link between a lead and the
 * customer's activity is:
 *   - orders      → sales_orders.lead_id / account_id / recipient_email
 *   - quotes      → commerce_quotes.user_id (the customer profile matched by email)
 *   - agreements  → user_agreements.user_id (same profile) + location_agreements.lead_id
 *
 * Visibility mirrors the existing lead-list scoping (src/lib/salesAuth.ts):
 *   - elevated roles (admin / director_of_sales / market_leader): any lead
 *   - sales_manager: any assigned lead
 *   - sales: only leads assigned to them
 *
 * This module is pure (no DB, no env) so the scoping and normalization rules
 * are unit-testable; the route does the service-role reads.
 */

export interface ActingUser {
  id: string;
  role: SalesRole;
}

/**
 * May this user view a lead's customer activity?
 * An unassigned lead is only visible to elevated roles.
 */
export function canRepSeeLead(assignedTo: string | null | undefined, user: ActingUser): boolean {
  if (isElevatedRole(user.role)) return true;
  if (canSeeTeamAssignedLeads(user.role)) return Boolean(assignedTo);
  return Boolean(assignedTo) && assignedTo === user.id;
}

/** Lowercase + trim an email for case-insensitive matching (null-safe). */
export function normalizeEmail(email: string | null | undefined): string | null {
  const cleaned = (email ?? "").trim().toLowerCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** Dedupe rows by `id`, keeping first occurrence (stable). */
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (row.id && !seen.has(row.id)) {
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

export interface LeadOrderSummary {
  id: string;
  order_number: number | null;
  status: string | null;
  total_value: number | null;
  payment_status: string | null;
  created_at: string | null;
}

export interface LeadQuoteSummary {
  id: string;
  quote_number: string | null;
  status: string | null;
  total: number | null;
  created_at: string | null;
}

export interface LeadAgreementSummary {
  id: string;
  kind: "user_agreement" | "location_agreement";
  agreement_type: string | null;
  status: string | null;
  created_at: string | null;
}

export interface LeadCustomerActivity {
  orders: LeadOrderSummary[];
  quotes: LeadQuoteSummary[];
  agreements: LeadAgreementSummary[];
}
