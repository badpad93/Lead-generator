import { supabaseAdmin } from "./supabaseAdmin";
import { randomBytes } from "crypto";

export interface TeamContext {
  companyId: string;
  role: "owner" | "manager" | "agent";
}

/**
 * Resolve the partner's team context. Owners without a company yet get one
 * auto-created (so team management "just works" the first time they open it).
 * Non-owner team members return their existing membership.
 */
export async function resolveTeamContextForPartner(profileId: string): Promise<TeamContext | null> {
  // Existing membership?
  const { data: existing } = await supabaseAdmin
    .from("placement_team_members")
    .select("company_id, role, active")
    .eq("profile_id", profileId)
    .eq("active", true)
    .maybeSingle();
  if (existing?.company_id) {
    return { companyId: existing.company_id, role: existing.role as TeamContext["role"] };
  }

  // Company they own but no team_members row yet? (early adopters may hit this)
  const { data: owned } = await supabaseAdmin
    .from("placement_companies")
    .select("id")
    .eq("owner_profile_id", profileId)
    .eq("active", true)
    .maybeSingle();
  if (owned?.id) {
    await ensureOwnerMembership(owned.id, profileId);
    return { companyId: owned.id, role: "owner" };
  }

  // Auto-create a company for the partner from their business_name.
  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("business_name")
    .eq("id", profileId)
    .maybeSingle();
  if (!partner) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", profileId)
    .maybeSingle();

  const businessName = partner.business_name || profile?.full_name || "My Placement Company";
  const { data: created, error } = await supabaseAdmin
    .from("placement_companies")
    .insert({ owner_profile_id: profileId, business_name: businessName })
    .select("id")
    .single();
  if (error || !created) return null;

  await ensureOwnerMembership(created.id, profileId);
  return { companyId: created.id, role: "owner" };
}

async function ensureOwnerMembership(companyId: string, profileId: string): Promise<void> {
  await supabaseAdmin
    .from("placement_team_members")
    .upsert(
      {
        company_id: companyId,
        profile_id: profileId,
        role: "owner",
        active: true,
        joined_at: new Date().toISOString(),
      },
      { onConflict: "company_id,profile_id" },
    );
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export function inviteExpiryDays(days = 14): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
