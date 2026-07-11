import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Lead Generator access resolver.
 *
 * Single source of truth. Every LG page, API, and nav gate must call
 * this — do not re-implement the business rule anywhere else.
 *
 * Rule summary:
 *   FREE (no payment) — admin, sales-family, placement_partner, locator,
 *     or any user with an active placement_partners row.
 *   PAID ($9.99/mo QB Recurring) — operator (no PP row), location_manager,
 *     requestor.
 *   HIDDEN — everyone else (admin can grant via admin_override entitlement).
 *
 * CRM access is a SEPARATE gate. Placement Providers get LG + zero CRM.
 */

export const LEAD_GENERATOR_MONTHLY_PRICE_USD = 9.99;
export const LEAD_GENERATOR_MONTHLY_PRICE_CENTS = 999;

export type LGReason =
  | "role_admin"
  | "role_sales_family"
  | "role_placement_partner"
  | "role_locator"
  | "placement_partner_row"
  | "admin_override_granted"
  | "admin_override_revoked"
  | "subscription_active"
  | "subscription_missing"
  | "subscription_incomplete"
  | "subscription_past_due"
  | "subscription_canceled"
  | "subscription_unpaid"
  | "role_not_recognized"
  | "no_user";

const FREE_ROLES = new Set([
  "admin",
  "sales",
  "sales_manager",
  "director_of_sales",
  "market_leader",
  "placement_partner",
  "locator",
]);

const PAID_ROLES = new Set([
  "operator",
  "location_manager",
  "requestor",
]);

const CRM_ALLOWED_ROLES = new Set([
  "admin",
  "sales",
  "sales_manager",
  "director_of_sales",
  "market_leader",
]);

export interface LeadGeneratorAccess {
  canAccessLeadGenerator: boolean;
  requiresSubscription: boolean;
  hasActiveSubscription: boolean;
  shouldShowPaymentGate: boolean;
  canAccessCRM: boolean;
  isPlacementProvider: boolean;
  reason: LGReason;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

interface ProfileRow {
  id: string;
  role: string;
}

interface EntitlementRow {
  entitlement_key: string;
  source: string;
  status: string;
  metadata: Record<string, unknown> | null;
}

interface SubRow {
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

export async function getLeadGeneratorAccess(
  userId: string | null | undefined,
): Promise<LeadGeneratorAccess> {
  if (!userId) {
    return baseline(false, "no_user");
  }

  const [{ data: profile }, { data: entitlement }, { data: sub }, ppRow] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle() as unknown as Promise<{ data: ProfileRow | null }>,
    supabaseAdmin
      .from("account_entitlements")
      .select("entitlement_key, source, status, metadata")
      .eq("user_id", userId)
      .eq("entitlement_key", "lead_generator_access")
      .maybeSingle() as unknown as Promise<{ data: EntitlementRow | null }>,
    supabaseAdmin
      .from("lead_generator_subscriptions")
      .select("status, current_period_end, cancel_at_period_end")
      .eq("user_id", userId)
      .maybeSingle() as unknown as Promise<{ data: SubRow | null }>,
    (async () => {
      const { data } = await supabaseAdmin
        .from("placement_partners")
        .select("id, active")
        .eq("id", userId)
        .maybeSingle();
      return data && data.active !== false ? data : null;
    })(),
  ]);

  const role = profile?.role || "";
  const isPP = !!ppRow || role === "placement_partner" || role === "locator";
  const canCRM = CRM_ALLOWED_ROLES.has(role);

  // Admin override — hard grant / hard revoke, wins over everything.
  if (entitlement?.source === "admin_override") {
    if (entitlement.status === "active") {
      return {
        canAccessLeadGenerator: true,
        requiresSubscription: false,
        hasActiveSubscription: false,
        shouldShowPaymentGate: false,
        canAccessCRM: canCRM,
        isPlacementProvider: isPP,
        reason: "admin_override_granted",
        subscription: sub ? { status: sub.status, current_period_end: sub.current_period_end, cancel_at_period_end: sub.cancel_at_period_end } : null,
      };
    }
    if (entitlement.status === "revoked") {
      return {
        canAccessLeadGenerator: false,
        requiresSubscription: false,
        hasActiveSubscription: false,
        shouldShowPaymentGate: false,
        canAccessCRM: canCRM,
        isPlacementProvider: isPP,
        reason: "admin_override_revoked",
        subscription: null,
      };
    }
  }

  // Free-role access.
  if (FREE_ROLES.has(role) || isPP) {
    let reason: LGReason = "role_not_recognized";
    if (role === "admin") reason = "role_admin";
    else if (role === "placement_partner") reason = "role_placement_partner";
    else if (role === "locator") reason = "role_locator";
    else if (
      role === "sales" || role === "sales_manager" ||
      role === "director_of_sales" || role === "market_leader"
    ) reason = "role_sales_family";
    else if (isPP) reason = "placement_partner_row";
    return {
      canAccessLeadGenerator: true,
      requiresSubscription: false,
      hasActiveSubscription: false,
      shouldShowPaymentGate: false,
      canAccessCRM: canCRM,
      isPlacementProvider: isPP,
      reason,
      subscription: null,
    };
  }

  // Paid-role access.
  if (PAID_ROLES.has(role)) {
    const hasActive = sub?.status === "active" || sub?.status === "trialing";
    if (hasActive) {
      return {
        canAccessLeadGenerator: true,
        requiresSubscription: true,
        hasActiveSubscription: true,
        shouldShowPaymentGate: false,
        canAccessCRM: canCRM,
        isPlacementProvider: isPP,
        reason: "subscription_active",
        subscription: sub ? { status: sub.status, current_period_end: sub.current_period_end, cancel_at_period_end: sub.cancel_at_period_end } : null,
      };
    }
    let reason: LGReason = "subscription_missing";
    if (sub?.status === "past_due") reason = "subscription_past_due";
    else if (sub?.status === "canceled") reason = "subscription_canceled";
    else if (sub?.status === "unpaid") reason = "subscription_unpaid";
    else if (sub?.status === "incomplete" || sub?.status === "incomplete_expired") reason = "subscription_incomplete";
    return {
      canAccessLeadGenerator: false,
      requiresSubscription: true,
      hasActiveSubscription: false,
      shouldShowPaymentGate: true,
      canAccessCRM: canCRM,
      isPlacementProvider: isPP,
      reason,
      subscription: sub ? { status: sub.status, current_period_end: sub.current_period_end, cancel_at_period_end: sub.cancel_at_period_end } : null,
    };
  }

  // Unknown / unsupported role — no access unless admin has granted.
  return baseline(canCRM, "role_not_recognized", isPP);
}

function baseline(canCRM: boolean, reason: LGReason, isPP = false): LeadGeneratorAccess {
  return {
    canAccessLeadGenerator: false,
    requiresSubscription: false,
    hasActiveSubscription: false,
    shouldShowPaymentGate: false,
    canAccessCRM: canCRM,
    isPlacementProvider: isPP,
    reason,
    subscription: null,
  };
}

/**
 * Convenience: returns just the boolean decision + the redirect target
 * (either a subscribe URL or an access-denied path). Callers pushing
 * users through server-side redirects use this.
 */
export async function requireLeadGeneratorOrRedirect(
  userId: string | null | undefined,
): Promise<{ ok: true; access: LeadGeneratorAccess } | { ok: false; redirect: string; access: LeadGeneratorAccess }> {
  const access = await getLeadGeneratorAccess(userId);
  if (access.canAccessLeadGenerator) return { ok: true, access };
  if (access.shouldShowPaymentGate) return { ok: false, redirect: "/tools/lead-generator/subscribe", access };
  return { ok: false, redirect: "/", access };
}
