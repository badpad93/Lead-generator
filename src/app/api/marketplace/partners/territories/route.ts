import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceOnboardingEnabled } from "@/lib/marketplaceFlags";

export async function POST(req: NextRequest) {
  if (!marketplaceOnboardingEnabled()) return forbidden("Onboarding disabled");
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const body = await req.json().catch(() => ({}));
  const territories = Array.isArray(body.territories) ? body.territories : [];

  // Replace-all semantics for onboarding — delete then re-insert.
  await supabaseAdmin
    .from("placement_territories")
    .delete()
    .eq("owner_type", "partner")
    .eq("owner_id", user.id);

  if (territories.length > 0) {
    const rows = territories
      .map((t: { state?: string; city?: string; travel_radius_miles?: number }) => ({
        owner_type: "partner",
        owner_id: user.id,
        state: t.state?.toUpperCase() || null,
        city: t.city || null,
        travel_radius_miles: t.travel_radius_miles || null,
      }))
      .filter((t: { state: string | null; city: string | null }) => t.state || t.city);

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("placement_territories").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
