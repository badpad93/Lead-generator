import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Marketplace-wide policy knobs. Singleton row in
 * placement_marketplace_settings. Any auto-created contract from the
 * /request-location deposit flow reads this default; per-contract
 * overrides still live on placement_contracts.platform_fee /
 * partner_payout for bespoke deals.
 *
 * Units: platform_take is stored as numeric dollars (not cents) to
 * stay unit-consistent with placement_contracts.platform_fee /
 * partner_payout / operator_price. Every money field on that path
 * is dollars, so a bespoke contract override reads cleanly against
 * the default without a 100× conversion trap.
 */

const DEFAULT_TAKE_DOLLARS = 100; // $100 — matches original tier seed

export interface MarketplaceSettings {
  platformTakeDollars: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getMarketplaceSettings(): Promise<MarketplaceSettings> {
  const { data } = await supabaseAdmin
    .from("placement_marketplace_settings")
    .select("platform_take, updated_at, updated_by")
    .limit(1)
    .maybeSingle();
  if (!data) {
    return {
      platformTakeDollars: DEFAULT_TAKE_DOLLARS,
      updatedAt: null,
      updatedBy: null,
    };
  }
  return {
    platformTakeDollars: Number(data.platform_take ?? DEFAULT_TAKE_DOLLARS),
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}

export async function setPlatformTakeDollars(
  dollars: number,
  updatedBy: string | null,
): Promise<MarketplaceSettings> {
  if (!Number.isFinite(dollars) || dollars < 0) {
    throw new Error("platform_take must be a non-negative dollar amount");
  }
  // Round to two decimals so we don't drift sub-cent — DB CHECK
  // allows any non-negative numeric but we keep pennies clean.
  const takeDollars = Math.round(dollars * 100) / 100;

  const { data: existing } = await supabaseAdmin
    .from("placement_marketplace_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("placement_marketplace_settings")
      .update({
        platform_take: takeDollars,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", existing.id)
      .select("platform_take, updated_at, updated_by")
      .single();
    if (error) throw error;
    return {
      platformTakeDollars: Number(data.platform_take),
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("placement_marketplace_settings")
    .insert({ platform_take: takeDollars, updated_by: updatedBy })
    .select("platform_take, updated_at, updated_by")
    .single();
  if (error) throw error;
  return {
    platformTakeDollars: Number(data.platform_take),
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}
