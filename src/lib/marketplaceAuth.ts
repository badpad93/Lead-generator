import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "./apiAuth";
import { supabaseAdmin } from "./supabaseAdmin";

export type CompanyRole = "owner" | "manager" | "agent";

export interface PlacementPartnerUser {
  id: string;
  email: string;
  full_name: string;
  role: string; // profile role
  onboarding_complete: boolean;
  active: boolean;
  partner_type: string;
  business_name: string | null;
  companies: Array<{ company_id: string; role: CompanyRole }>;
}

/**
 * Validate the request can act as a Placement Partner. As of the dual-role
 * work, a placement_partners row is the source of truth for "has locator
 * capability" — operators, sales, requestors etc. can hold that row alongside
 * their primary profile role without losing access to their real tools.
 *
 * Accepts:
 *  - profile.role === 'placement_partner' — legacy PPs (may or may not have
 *    a placement_partners row yet if they're mid-onboarding)
 *  - profile.role === 'admin' — Vending Connector admin (QA / support flows)
 *  - anyone with an active placement_partners row — dual-role users
 */
export async function getPlacementPartner(req: NextRequest): Promise<PlacementPartnerUser | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .single();
  if (!profile) return null;

  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("onboarding_complete, active, partner_type, business_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: memberships } = await supabaseAdmin
    .from("placement_team_members")
    .select("company_id, role, active")
    .eq("profile_id", userId)
    .eq("active", true);

  const hasPartnerRow = !!partner && partner.active !== false;
  const hasTeamMembership = (memberships || []).length > 0;
  const roleAllowed = profile.role === "placement_partner" || profile.role === "admin";
  if (!hasPartnerRow && !hasTeamMembership && !roleAllowed) return null;

  return {
    id: userId,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    onboarding_complete: partner?.onboarding_complete === true,
    active: partner?.active !== false,
    partner_type: partner?.partner_type || "individual",
    business_name: partner?.business_name || null,
    companies: (memberships || []).map((m) => ({ company_id: m.company_id, role: m.role as CompanyRole })),
  };
}

export interface MarketplaceViewer {
  id: string;
  email: string;
  full_name: string;
  role: string | null;
  is_partner: boolean;              // true if they have an active placement_partners row
  partner_active: boolean;          // partner row exists and .active !== false
  partner_onboarding_complete: boolean;
}

/**
 * Lightweight viewer for the marketplace browse surfaces. Any authed user can
 * be a viewer — an operator/sales/requestor who wants to browse open contracts
 * before deciding to add locator capability, an existing PP, or an admin.
 *
 * Use this on GET /api/marketplace/contracts + detail. Mutations
 * (accept, submit, tier-propose) must keep using getPlacementPartner.
 */
export async function getMarketplaceViewer(req: NextRequest): Promise<MarketplaceViewer | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("active, onboarding_complete")
    .eq("id", userId)
    .maybeSingle();

  const partner_active = !!partner && partner.active !== false;
  return {
    id: userId,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    is_partner: partner_active,
    partner_active,
    partner_onboarding_complete: partner?.onboarding_complete === true,
  };
}

export function forbidden(msg = "Forbidden"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 403 });
}

/** Team-owner or manager on the given company. */
export function canManageTeam(user: PlacementPartnerUser, companyId: string): boolean {
  return user.companies.some(
    (c) => c.company_id === companyId && (c.role === "owner" || c.role === "manager"),
  );
}

/** Team-owner on the given company. */
export function isOwner(user: PlacementPartnerUser, companyId: string): boolean {
  return user.companies.some((c) => c.company_id === companyId && c.role === "owner");
}
