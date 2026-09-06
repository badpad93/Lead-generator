import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertPublicShape, type CustomerContextOutput, type RoleClass } from "../publicShapes";
import type { ToolContext } from "./context";

const STAFF_ROLES = new Set(["admin", "sales", "sales_manager", "director_of_sales", "market_leader"]);
const PARTNER_ROLES = new Set(["placement_partner", "manufacturer_partner"]);
const OPERATOR_ROLES = new Set(["operator", "locator", "location_manager", "requestor"]);

export function classifyRole(role: string | null): RoleClass {
  if (role === "customer") return "customer";
  if (role && STAFF_ROLES.has(role)) return "staff";
  if (role && PARTNER_ROLES.has(role)) return "partner";
  if (role && OPERATOR_ROLES.has(role)) return "operator";
  return "member";
}

export function firstName(fullName: string | null): string | null {
  const first = (fullName ?? "").trim().split(/\s+/)[0];
  return first || null;
}

async function countOwned(table: string, column: string, userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, userId);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Self-only summary. Every count is keyed on a trusted user-id column:
 * coffee_orders.operator_id, workflows.customer_id,
 * storefront_quotes.customer_profile_id. Nothing is matched by email.
 */
export async function runGetCustomerContext(ctx: ToolContext): Promise<CustomerContextOutput> {
  if (!ctx.profile) return assertPublicShape({ authenticated: false });
  const uid = ctx.profile.id;
  const [coffeeOrders, workflows, quotes] = await Promise.all([
    countOwned("coffee_orders", "operator_id", uid),
    countOwned("workflows", "customer_id", uid),
    countOwned("storefront_quotes", "customer_profile_id", uid),
  ]);
  return assertPublicShape({
    authenticated: true,
    first_name: firstName(ctx.profile.full_name),
    role_class: classifyRole(ctx.profile.role),
    coffee_access: ctx.profile.coffee_access_enabled || !!ctx.storefront,
    storefront: ctx.storefront ? { display_name: ctx.storefront.display_name, slug: ctx.storefront.slug } : null,
    counts: { coffee_orders: coffeeOrders, workflows, storefront_quotes: quotes },
  });
}
