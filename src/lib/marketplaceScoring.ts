/**
 * Phase 2.9 — Partner scoring + tiering.
 *
 * Score formula (0-100):
 *   rating_component (40) — (rating / 5) * 40, or 0 if unrated
 *   close_rate_component (35) — (accepted / total) * 35
 *   volume_component (25) — min(accepted / 20, 1) * 25 (caps at 20 accepted)
 *
 * Tiers auto-assigned on recompute:
 *   score >= 80 → gold
 *   score >= 55 → silver
 *   else        → bronze
 *
 * Admin can pin a partner to a tier via partner_tier_override; if set, the
 * override wins over the computed tier.
 *
 * Recompute is called from:
 *   - submitRating (after a rating goes in)
 *   - operator accept/reject handler (after a submission decision)
 */

import { supabaseAdmin } from "./supabaseAdmin";

export type Tier = "bronze" | "silver" | "gold";

const RATING_WEIGHT = 40;
const CLOSE_RATE_WEIGHT = 35;
const VOLUME_WEIGHT = 25;
const VOLUME_CAP = 20;

const GOLD_THRESHOLD = 80;
const SILVER_THRESHOLD = 55;

export function computeTierFromScore(score: number): Tier {
  if (score >= GOLD_THRESHOLD) return "gold";
  if (score >= SILVER_THRESHOLD) return "silver";
  return "bronze";
}

export interface ScoreComponents {
  score: number;
  tier: Tier;
  accepted: number;
  total: number;
  rating: number | null;
}

/**
 * Recompute + persist score + tier for one partner. Also updates the
 * denormalized submission counts so leaderboard queries are cheap.
 */
export async function recomputePartnerScore(partnerId: string): Promise<ScoreComponents | null> {
  const [{ data: partner }, { data: submissions }] = await Promise.all([
    supabaseAdmin
      .from("placement_partners")
      .select("id, rating, partner_tier_override")
      .eq("id", partnerId)
      .maybeSingle(),
    supabaseAdmin
      .from("placement_submissions")
      .select("operator_status")
      .eq("partner_id", partnerId),
  ]);
  if (!partner) return null;

  const total = submissions?.length || 0;
  const accepted = (submissions || []).filter((s) => s.operator_status === "accepted").length;
  const rating = partner.rating != null ? Number(partner.rating) : null;

  // Components
  const ratingComp = rating != null ? (rating / 5) * RATING_WEIGHT : 0;
  const closeRateComp = total > 0 ? (accepted / total) * CLOSE_RATE_WEIGHT : 0;
  const volumeComp = Math.min(accepted / VOLUME_CAP, 1) * VOLUME_WEIGHT;
  const score = Math.round((ratingComp + closeRateComp + volumeComp) * 100) / 100;

  const computedTier = computeTierFromScore(score);
  // Override wins if set to a valid tier.
  const finalTier: Tier =
    partner.partner_tier_override === "gold" || partner.partner_tier_override === "silver" || partner.partner_tier_override === "bronze"
      ? partner.partner_tier_override
      : computedTier;

  await supabaseAdmin
    .from("placement_partners")
    .update({
      partner_score: score,
      partner_tier: finalTier,
      partner_tier_computed_at: new Date().toISOString(),
      submissions_total_count: total,
      submissions_accepted_count: accepted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  return { score, tier: finalTier, accepted, total, rating };
}

/**
 * Gold-tier-first window for premium contracts. Tier-3 contracts are hidden
 * from silver/bronze partners for the first N hours after opening; anything
 * older is fair game for everyone.
 */
export const GOLD_ONLY_HOURS_FOR_TIER_3 = 24;

export function contractHiddenFromPartnerTier(
  contract: { tier: number; created_at: string; status: string },
  partnerTier: Tier,
): boolean {
  if (contract.tier !== 3) return false;
  if (partnerTier === "gold") return false;
  const openedAt = new Date(contract.created_at).getTime();
  const cutoff = openedAt + GOLD_ONLY_HOURS_FOR_TIER_3 * 60 * 60 * 1000;
  return Date.now() < cutoff;
}
