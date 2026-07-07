import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMarketplaceViewer } from "@/lib/marketplaceAuth";
import { contractHiddenFromPartnerTier, type Tier } from "@/lib/marketplaceScoring";

/**
 * GET — return open + in_progress contracts.
 *
 * Any authed user can view (they hit the identity-scrubbed
 * partner_visible_contracts view, so no operator identity leaks). The
 * response wraps the row list with an `is_partner` flag so the client can
 * render an "Add locator capability" CTA for non-locators instead of the
 * accept flow.
 *
 * For real Placement Partners: filter by their territories, subtract
 * already-accepted contracts, and apply tier-3 24h gold gate.
 *
 * For non-partners: no territory filter (they haven't set any yet); tier
 * gate defaults to bronze so the browse view matches what a fresh PP would
 * see, avoiding leaking newer tier-3 contracts before the 24h gold window.
 */
export async function GET(req: NextRequest) {
  const viewer = await getMarketplaceViewer(req);
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Partner territories (only meaningful when viewer.is_partner is true)
  const { data: territories } = viewer.is_partner
    ? await supabaseAdmin
        .from("placement_territories")
        .select("state, city")
        .eq("owner_type", "partner")
        .eq("owner_id", viewer.id)
    : { data: [] as Array<{ state: string | null; city: string | null }> };

  // "US" is a nationwide wildcard. Non-partners are treated as nationwide.
  const hasNationwide = !viewer.is_partner || (territories || []).some(
    (t) => (t.state || "").toUpperCase() === "US",
  );
  const states = hasNationwide
    ? []
    : Array.from(
        new Set(
          (territories || [])
            .map((t) => (t.state || "").toUpperCase())
            .filter((s) => s && s !== "US"),
        ),
      );

  let query = supabaseAdmin.from("partner_visible_contracts").select("*").order("created_at", { ascending: false });
  if (!hasNationwide && states.length > 0) {
    query = query.in("market_state", states);
  }
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const territoryCities = new Set(
    (territories || [])
      .filter((t) => t.city)
      .map((t) => `${(t.state || "").toUpperCase()}|${(t.city || "").toLowerCase()}`),
  );
  const territoryStatewide = new Set(
    (territories || []).filter((t) => !t.city && t.state).map((t) => (t.state || "").toUpperCase()),
  );

  const filtered = hasNationwide
    ? (rows || [])
    : (rows || []).filter((c) => {
        const st = (c.market_state || "").toUpperCase();
        const city = (c.market_city || "").toLowerCase();
        if (!st) return true;
        if (territoryStatewide.has(st)) return true;
        if (city && territoryCities.has(`${st}|${city}`)) return true;
        return false;
      });

  // Partners hide contracts they've already accepted (those go under
  // "My Contracts"). Non-partners see the full list.
  let openToMe = filtered;
  if (viewer.is_partner) {
    const { data: myAcceptances } = await supabaseAdmin
      .from("placement_contract_acceptances")
      .select("contract_id, released_at")
      .eq("partner_id", viewer.id);
    const acceptedIds = new Set(
      (myAcceptances || []).filter((a) => !a.released_at).map((a) => a.contract_id),
    );
    openToMe = filtered.filter((c) => !acceptedIds.has(c.id));
  }

  // Tier-3 24h gold gate — for partners, use their tier; for non-partners
  // default to bronze so we don't leak newer tier-3 contracts.
  const partnerTier: Tier = viewer.is_partner
    ? await supabaseAdmin
        .from("placement_partners")
        .select("partner_tier")
        .eq("id", viewer.id)
        .maybeSingle()
        .then((r) => (r.data?.partner_tier as Tier) || "bronze")
    : "bronze";
  const gatedByTier = openToMe.filter((c) => !contractHiddenFromPartnerTier(c, partnerTier));

  return NextResponse.json({
    contracts: gatedByTier,
    is_partner: viewer.is_partner,
    partner_onboarding_complete: viewer.partner_onboarding_complete,
    viewer_role: viewer.role,
  });
}
