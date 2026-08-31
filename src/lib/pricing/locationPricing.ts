export type BusinessHours = "low" | "medium" | "high" | "24/7";
export type MachinesRequested = 1 | 2 | 3 | 4;

export interface PricingInput {
  employees: number;
  foot_traffic: number;
  business_hours: BusinessHours;
  machines_requested: MachinesRequested;
  /**
   * "10/10/10" prepaid deal — customer pays for everything up front,
   * so the per-location fee drops to a flat $400 regardless of the
   * computed score, and downstream flows skip the $100/location
   * deposit invoice. Toggle lives on sales_orders.is_ten_ten_ten.
   */
  is_ten_ten_ten?: boolean;
}

export type LocationTier = 1 | 2 | 3;

export interface PricingResult {
  total_score: number;
  traffic_score: number;
  hours_score: number;
  machine_score: number;
  tier: LocationTier;
  tier_label: string;
  price: number;
  is_ten_ten_ten: boolean;
}

const HOURS_SCORES: Record<BusinessHours, number> = {
  low: 10,
  medium: 20,
  high: 30,
  "24/7": 40,
};

const MACHINE_SCORES: Record<MachinesRequested, number> = {
  1: 8,
  2: 15,
  3: 23,
  4: 30,
};

/**
 * Three-tier ladder — Basic / Premium / Elite.
 *
 * Score inputs (traffic + hours + machines) are unchanged from the
 * previous five-tier version; the collapsed tiers roll up as:
 *   old Tier1 ($400) + Tier2 ($500)        -> Basic   $500
 *   old Tier3 ($750) + lower Tier4         -> Premium $800
 *   old top of Tier4 + Tier5 ($1000/$1200) -> Elite   $1200
 *
 * TIER_PRICES is the single source of truth for both:
 *   - Customer-facing per-location pricing (this file)
 *   - Marketplace operator per-location price
 *     (src/lib/marketplace/contracts.ts imports TIER1_PRICE_DOLLARS)
 */
export const TIER_PRICES: Record<LocationTier, number> = {
  1: 500,
  2: 800,
  3: 1200,
};

/** Flat price when the customer took the 10/10/10 deal. */
export const TEN_TEN_TEN_PRICE = 400;

/**
 * Coerce a legacy pricing_tier value (old 1..5 ladder) into the new
 * 1..3 ladder. Backfill migration 164 already rewrites the DB, but
 * any pricing_tier column read in code that hasn't been migrated yet
 * — or a race with an in-flight write — still needs a safe map.
 *   1,2 -> 1  (old Basic tiers roll into new Basic)
 *   3   -> 2  (old Premium -> new Premium)
 *   4,5 -> 3  (old top tiers roll into new Elite)
 */
export function coerceTier(raw: number | null | undefined): LocationTier {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 2) return 1;
  if (n === 3) return 2;
  return 3;
}

/** The "default" per-location price to fall back to when a legacy
 *  order line item has no unit_price. Historically was $400 (old
 *  Tier1); now snaps to the new Basic tier. */
export const DEFAULT_LOCATION_PRICE = TIER_PRICES[1];

const TIERS: { min: number; tier: LocationTier; label: string }[] = [
  { min: 90, tier: 3, label: "Elite" },
  { min: 60, tier: 2, label: "Premium" },
  { min: 0,  tier: 1, label: "Basic" },
];

export function calculateLocationPrice(input: PricingInput): PricingResult {
  if (input.employees < 0) throw new Error("employees must be >= 0");
  if (input.foot_traffic < 0) throw new Error("foot_traffic must be >= 0");

  const hoursScore = HOURS_SCORES[input.business_hours];
  if (hoursScore === undefined) {
    throw new Error(`Invalid business_hours: ${input.business_hours}. Must be one of: low, medium, high, 24/7`);
  }

  const machineScore = MACHINE_SCORES[input.machines_requested];
  if (machineScore === undefined) {
    throw new Error(`Invalid machines_requested: ${input.machines_requested}. Must be 1, 2, 3, or 4`);
  }

  const totalTraffic = input.employees + input.foot_traffic;
  const trafficScore = Math.min((totalTraffic / 500) * 30, 30);

  const rawTotal = trafficScore + hoursScore + machineScore;
  const totalScore = Math.round(Math.min(rawTotal, 100));

  const matched = TIERS.find((t) => totalScore >= t.min)!;

  const isTenTenTen = !!input.is_ten_ten_ten;
  const price = isTenTenTen ? TEN_TEN_TEN_PRICE : TIER_PRICES[matched.tier];

  return {
    total_score: totalScore,
    traffic_score: Math.round(trafficScore * 100) / 100,
    hours_score: hoursScore,
    machine_score: machineScore,
    tier: matched.tier,
    tier_label: isTenTenTen ? "10/10/10 Prepaid" : matched.label,
    price,
    is_ten_ten_ten: isTenTenTen,
  };
}
