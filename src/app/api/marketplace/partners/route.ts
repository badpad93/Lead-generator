import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { marketplaceOnboardingEnabled } from "@/lib/marketplaceFlags";

/**
 * GET — return the current placement partner record for the signed-in user.
 * POST — upsert basic profile fields (business name, bio, partner type). If
 * the profile.role isn't 'placement_partner' yet, upgrade it. Idempotent so
 * the onboarding wizard can save each step.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  const [{ data: territories }, { data: industries }, { data: docs }, { data: bank }] = await Promise.all([
    supabaseAdmin.from("placement_territories").select("*").eq("owner_type", "partner").eq("owner_id", userId),
    supabaseAdmin.from("placement_industries").select("*").eq("owner_type", "partner").eq("owner_id", userId),
    supabaseAdmin.from("placement_partner_documents").select("*").eq("partner_id", userId).order("uploaded_at", { ascending: false }),
    supabaseAdmin.from("placement_bank_accounts").select("*").eq("partner_id", userId).eq("active", true),
  ]);

  return NextResponse.json({
    profile,
    partner,
    territories: territories || [],
    industries: industries || [],
    documents: docs || [],
    bank_accounts: bank || [],
  });
}

export async function POST(req: NextRequest) {
  if (!marketplaceOnboardingEnabled()) {
    return NextResponse.json({ error: "Marketplace onboarding is not available yet." }, { status: 403 });
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const partnerType = body.partner_type === "company_owner" ? "company_owner" : "individual";
  const businessName = String(body.business_name || "").trim();
  const bio = String(body.bio || "").trim();

  // Upgrade profile role (safe: existing roles are unaffected)
  await supabaseAdmin
    .from("profiles")
    .update({ role: "placement_partner" })
    .eq("id", userId);

  // Upsert partner
  const { data: partner, error } = await supabaseAdmin
    .from("placement_partners")
    .upsert(
      {
        id: userId,
        partner_type: partnerType,
        business_name: businessName || null,
        bio: bio || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("placement_partner_activity").insert({
    partner_id: userId,
    actor_id: userId,
    activity_type: "profile_updated",
    description: "Partner profile saved from onboarding",
  });

  return NextResponse.json(partner);
}
