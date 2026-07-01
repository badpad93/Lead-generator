import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceOnboardingEnabled } from "@/lib/marketplaceFlags";

export const INDUSTRIES = [
  "Warehouse",
  "Manufacturing",
  "Office",
  "Hotel",
  "Hospital",
  "Retail",
  "Education",
  "Government",
  "Automotive",
  "Fitness",
  "Entertainment",
  "Transportation",
  "Restaurant",
  "Other",
] as const;

export async function POST(req: NextRequest) {
  if (!marketplaceOnboardingEnabled()) return forbidden("Onboarding disabled");
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const body = await req.json().catch(() => ({}));
  const industries: string[] = Array.isArray(body.industries) ? body.industries : [];

  await supabaseAdmin
    .from("placement_industries")
    .delete()
    .eq("owner_type", "partner")
    .eq("owner_id", user.id);

  const clean = industries.filter((i) => INDUSTRIES.includes(i as (typeof INDUSTRIES)[number]));
  if (clean.length > 0) {
    const rows = clean.map((industry) => ({
      owner_type: "partner",
      owner_id: user.id,
      industry,
    }));
    const { error } = await supabaseAdmin.from("placement_industries").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
