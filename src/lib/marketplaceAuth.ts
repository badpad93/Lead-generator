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
 * Validate the request is a Placement Partner (or team member).
 * Returns null if unauthorized. Fully self-contained — does not depend on
 * getSalesUser or any admin-side check.
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

  // Accept:
  //  - placement_partner: normal PPs going through their own dashboard
  //  - admin: so a Vending Connector admin can walk through the wizard
  //    (for QA / debugging / supporting a partner over the phone) without
  //    the "don't clobber elevated roles" guard in POST /partners blocking
  //    them out of Step 2 onwards.
  const allowed = profile.role === "placement_partner" || profile.role === "admin";
  if (!allowed) return null;

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
