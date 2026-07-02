import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";
import { marketplaceContractsEnabled } from "@/lib/marketplaceFlags";
import { contractHiddenFromPartnerTier, type Tier } from "@/lib/marketplaceScoring";

/**
 * GET — return open + in_progress contracts visible to this partner.
 * Uses the partner_visible_contracts view so no operator identity is exposed.
 * Filters by territory (state / city) so partners only see contracts they can
 * actually accept. Attaches an `is_eligible` boolean per row.
 */
export async function GET(req: NextRequest) {
  if (!marketplaceContractsEnabled()) return NextResponse.json([]);

  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  // Partner territories
  const { data: territories } = await supabaseAdmin
    .from("placement_territories")
    .select("state, city")
    .eq("owner_type", "partner")
    .eq("owner_id", user.id);
  const states = Array.from(
    new Set((territories || []).map((t) => (t.state || "").toUpperCase()).filter(Boolean)),
  );

  // Pull open contracts through the anonymized view
  let query = supabaseAdmin.from("partner_visible_contracts").select("*").order("created_at", { ascending: false });
  if (states.length > 0) {
    query = query.in("market_state", states);
  }
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // City filter (do in JS — the view is generic)
  const territoryCities = new Set(
    (territories || [])
      .filter((t) => t.city)
      .map((t) => `${(t.state || "").toUpperCase()}|${(t.city || "").toLowerCase()}`),
  );
  const territoryStatewide = new Set(
    (territories || []).filter((t) => !t.city && t.state).map((t) => (t.state || "").toUpperCase()),
  );

  const filtered = (rows || []).filter((c) => {
    const st = (c.market_state || "").toUpperCase();
    const city = (c.market_city || "").toLowerCase();
    if (!st) return true;
    if (territoryStatewide.has(st)) return true;
    if (city && territoryCities.has(`${st}|${city}`)) return true;
    return false;
  });

  // Skip contracts the partner has already accepted (they appear under "My Contracts")
  const { data: myAcceptances } = await supabaseAdmin
    .from("placement_contract_acceptances")
    .select("contract_id, released_at")
    .eq("partner_id", user.id);
  const acceptedIds = new Set(
    (myAcceptances || []).filter((a) => !a.released_at).map((a) => a.contract_id),
  );

  const openToMe = filtered.filter((c) => !acceptedIds.has(c.id));

  // Phase 2.9 — Tier-3 contracts are gold-only for the first 24 hours.
  const { data: partnerRow } = await supabaseAdmin
    .from("placement_partners")
    .select("partner_tier")
    .eq("id", user.id)
    .maybeSingle();
  const partnerTier: Tier = (partnerRow?.partner_tier as Tier) || "bronze";
  const gatedByTier = openToMe.filter((c) => !contractHiddenFromPartnerTier(c, partnerTier));

  return NextResponse.json(gatedByTier);
}
