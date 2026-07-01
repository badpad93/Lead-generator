import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceOnboardingEnabled } from "@/lib/marketplaceFlags";

/**
 * Flip onboarding_complete=true after the wizard. Admin still has to
 * verify identity/W9/bank + countersign the platform agreement before
 * the partner is eligible for contracts.
 */
export async function POST(req: NextRequest) {
  if (!marketplaceOnboardingEnabled()) return forbidden("Onboarding disabled");
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  // Basic completeness check
  const [{ data: partner }, { count: territoriesCount }, { count: industriesCount }, { count: w9Count }] = await Promise.all([
    supabaseAdmin.from("placement_partners").select("business_name").eq("id", user.id).maybeSingle(),
    supabaseAdmin.from("placement_territories").select("*", { count: "exact", head: true }).eq("owner_type", "partner").eq("owner_id", user.id),
    supabaseAdmin.from("placement_industries").select("*", { count: "exact", head: true }).eq("owner_type", "partner").eq("owner_id", user.id),
    supabaseAdmin.from("placement_partner_documents").select("*", { count: "exact", head: true }).eq("partner_id", user.id).eq("document_type", "w9"),
  ]);

  const missing: string[] = [];
  if (!partner?.business_name) missing.push("Business name");
  if (!territoriesCount) missing.push("Service territories");
  if (!industriesCount) missing.push("Target industries");
  if (!w9Count) missing.push("W9 upload");

  if (missing.length > 0) {
    return NextResponse.json({ error: `Incomplete: ${missing.join(", ")}` }, { status: 400 });
  }

  await supabaseAdmin
    .from("placement_partners")
    .update({ onboarding_complete: true, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  await supabaseAdmin.from("placement_partner_activity").insert({
    partner_id: user.id,
    actor_id: user.id,
    activity_type: "onboarding_completed",
    description: "Partner completed onboarding. Awaiting admin verification.",
  });

  return NextResponse.json({ ok: true });
}
