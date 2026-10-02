/**
 * Sales role predicates — pure, env-free, so they can be imported by both the
 * request-authenticating helper (salesAuth) and pure logic modules/tests
 * without pulling in the Supabase client (which throws when env is absent).
 */
export type SalesRole = "admin" | "director_of_sales" | "market_leader" | "sales_manager" | "sales";

export function isElevatedRole(role: SalesRole): boolean {
  return role === "admin" || role === "director_of_sales" || role === "market_leader";
}

/**
 * Can the role see assigned leads across the whole team?
 * - Elevated roles see everything (including unassigned).
 * - sales_manager sees all assigned leads but NOT unassigned.
 * - sales only sees their own.
 */
export function canSeeTeamAssignedLeads(role: SalesRole): boolean {
  return isElevatedRole(role) || role === "sales_manager";
}
