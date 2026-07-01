import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Partner is eligible for a contract if:
 * - partner is active + onboarding_complete + identity_verified_at set + w9_uploaded_at set
 * - a territory match exists (state matches, or the partner covers the same state
 *   with a city that matches / no city set for statewide coverage)
 * - at least one industry overlap with the contract's requirements (or contract
 *   has no industry requirement)
 * - partner has remaining capacity (capacity > active_acceptance_count)
 */
export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export async function isPartnerEligibleForContract(
  partnerId: string,
  contractId: string,
): Promise<EligibilityResult> {
  const reasons: string[] = [];

  const [{ data: partner }, { data: contract }, { data: reqs }] = await Promise.all([
    supabaseAdmin.from("placement_partners").select("*").eq("id", partnerId).maybeSingle(),
    supabaseAdmin.from("placement_contracts").select("*").eq("id", contractId).maybeSingle(),
    supabaseAdmin.from("placement_contract_requirements").select("*").eq("contract_id", contractId),
  ]);

  if (!partner) return { eligible: false, reasons: ["Partner not found"] };
  if (!contract) return { eligible: false, reasons: ["Contract not found"] };

  if (!partner.active) reasons.push("Partner deactivated");
  if (!partner.onboarding_complete) reasons.push("Onboarding incomplete");
  if (!partner.identity_verified_at) reasons.push("Identity not verified");
  if (!partner.w9_uploaded_at) reasons.push("W-9 not verified");
  if (contract.status !== "open" && contract.status !== "in_progress") {
    reasons.push("Contract is not open");
  }
  if (contract.locations_filled >= contract.locations_needed) {
    reasons.push("All slots filled");
  }

  // Territory match (state, optionally city)
  const { data: territories } = await supabaseAdmin
    .from("placement_territories")
    .select("state, city")
    .eq("owner_type", "partner")
    .eq("owner_id", partnerId);

  const targetState = (contract.market_state || "").toUpperCase();
  const targetCity = (contract.market_city || "").toLowerCase();
  const hasTerritory = (territories || []).some((t) => {
    const s = (t.state || "").toUpperCase();
    if (s && s !== targetState) return false;
    // If contract has a specific city and the partner declared a city, they must match.
    // If partner declared no city, they cover the whole state.
    if (targetCity && t.city) {
      return (t.city || "").toLowerCase() === targetCity;
    }
    return true;
  });
  if (!hasTerritory && targetState) {
    reasons.push(`No territory covering ${contract.market_city ? `${contract.market_city}, ` : ""}${contract.market_state}`);
  }

  // Industry overlap — only enforced if the contract lists industries
  const contractIndustries = (reqs || []).map((r) => r.industry).filter(Boolean) as string[];
  if (contractIndustries.length > 0) {
    const { data: partnerIndustries } = await supabaseAdmin
      .from("placement_industries")
      .select("industry")
      .eq("owner_type", "partner")
      .eq("owner_id", partnerId);
    const set = new Set((partnerIndustries || []).map((r) => r.industry));
    const overlap = contractIndustries.some((i) => set.has(i));
    if (!overlap) reasons.push(`No industry match (${contractIndustries.join(", ")})`);
  }

  // Capacity
  const { count: activeCount } = await supabaseAdmin
    .from("placement_contract_acceptances")
    .select("*", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .is("released_at", null);

  if ((activeCount || 0) >= (partner.capacity || 10)) {
    reasons.push(`At capacity (${activeCount}/${partner.capacity})`);
  }

  return { eligible: reasons.length === 0, reasons };
}
