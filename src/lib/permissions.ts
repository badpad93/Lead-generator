import { SalesRole } from "./salesAuth";
import { supabaseAdmin } from "./supabaseAdmin";

/* eslint-disable @typescript-eslint/no-explicit-any */
type QueryBuilder = any;

export type RoleLevel = 1 | 2 | 3 | 4;

export function getRoleLevel(role: SalesRole): RoleLevel {
  switch (role) {
    case "admin": return 1;
    case "director_of_sales": return 2;
    case "market_leader": return 3;
    case "sales": return 4;
    default: return 4;
  }
}

export type CrmSection =
  | "dashboard"
  | "results"
  | "leads"
  | "pipelines"
  | "deals"
  | "accounts"
  | "orders"
  | "team"
  | "commissions"
  | "call_lists"
  | "resources"
  | "candidates"
  | "hiring_dashboard"
  | "doc_templates"
  | "email_templates"
  | "doc_mapping";

const SECTION_MIN_LEVEL: Record<CrmSection, RoleLevel> = {
  dashboard: 4,
  results: 4,
  leads: 4,
  pipelines: 4,
  deals: 4,
  accounts: 4,
  orders: 4,
  commissions: 4,
  call_lists: 4,
  resources: 4,
  candidates: 4,
  team: 3,
  hiring_dashboard: 3,
  doc_templates: 1,
  email_templates: 1,
  doc_mapping: 1,
};

export function canAccessSection(role: SalesRole, section: CrmSection): boolean {
  return getRoleLevel(role) <= SECTION_MIN_LEVEL[section];
}

/**
 * Get user IDs that a market leader can see (their own market members).
 * Returns null for admin/DOS (no filtering needed).
 */
async function getMarketMemberIds(userId: string): Promise<string[]> {
  const { data: leaderMarkets } = await supabaseAdmin
    .from("market_leaders")
    .select("market_id")
    .eq("user_id", userId);

  if (!leaderMarkets || leaderMarkets.length === 0) return [userId];

  const marketIds = leaderMarkets.map((m) => m.market_id);

  const { data: members } = await supabaseAdmin
    .from("market_members")
    .select("user_id")
    .in("market_id", marketIds);

  const ids = new Set<string>([userId]);
  (members || []).forEach((m) => ids.add(m.user_id));
  return Array.from(ids);
}

export interface FilterContext {
  id: string;
  role: SalesRole;
}

/**
 * Apply role-based row filtering to a Supabase query.
 *
 * - Admin/DOS: no filter (see everything)
 * - Market Leader: see records where market_assignment = 'ALL' or own user_id,
 *   OR assigned_to/created_by is a member of their market
 * - Sales (BDP): see only own records (assigned_to or created_by = user.id)
 *
 * @param query - Supabase query builder (must have assigned_to column)
 * @param ctx - User context with id and role
 * @param opts - Column name overrides
 */
export async function filterByRole(
  query: QueryBuilder,
  ctx: FilterContext,
  opts?: { ownerCol?: string; creatorCol?: string; marketCol?: string }
) {
  const ownerCol = opts?.ownerCol ?? "assigned_to";
  const creatorCol = opts?.creatorCol ?? "created_by";
  const marketCol = opts?.marketCol ?? "market_assignment";
  const level = getRoleLevel(ctx.role);

  // Admin and DOS see everything
  if (level <= 2) return query;

  // Market Leader: see their market + ALL
  if (level === 3) {
    const memberIds = await getMarketMemberIds(ctx.id);
    const idList = memberIds.map((id) => `"${id}"`).join(",");
    return query.or(
      `${marketCol}.eq.ALL,${marketCol}.eq.${ctx.id},${ownerCol}.in.(${idList}),${creatorCol}.in.(${idList})`
    );
  }

  // BDP (sales): own records only
  return query.or(
    `${ownerCol}.eq.${ctx.id},${creatorCol}.eq.${ctx.id}`
  );
}

/**
 * Filter commissions by role hierarchy.
 * - Admin/DOS: see all
 * - Market Leader: see own team's commissions
 * - BDP: see only own commissions
 */
export async function filterCommissionsByRole(
  query: QueryBuilder,
  ctx: FilterContext
) {
  const level = getRoleLevel(ctx.role);

  if (level <= 2) return query;

  if (level === 3) {
    const memberIds = await getMarketMemberIds(ctx.id);
    return query.in("user_id", memberIds);
  }

  return query.eq("user_id", ctx.id);
}
