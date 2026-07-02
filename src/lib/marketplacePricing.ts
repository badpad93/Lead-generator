/**
 * Marketplace pricing tiers.
 * Vending Connector always keeps a flat $100 platform fee.
 * Tier is set at contract creation. Bumps require admin approval.
 */

export type Tier = 1 | 2 | 3;

export interface TierPricing {
  tier: Tier;
  partner_payout: number;
  operator_price: number;
  platform_fee: number;
}

export const TIERS: Record<Tier, TierPricing> = {
  1: { tier: 1, partner_payout: 400, operator_price: 500, platform_fee: 100 },
  2: { tier: 2, partner_payout: 750, operator_price: 850, platform_fee: 100 },
  3: { tier: 3, partner_payout: 1200, operator_price: 1300, platform_fee: 100 },
};

export function pricingForTier(tier: number | null | undefined): TierPricing {
  const t = (tier === 2 || tier === 3 ? tier : 1) as Tier;
  return TIERS[t];
}

export function tierLabel(tier: number | null | undefined): string {
  const p = pricingForTier(tier);
  return `Tier ${p.tier} — $${p.partner_payout}/location`;
}
