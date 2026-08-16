import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Marketplace-wide policy knobs. Singleton row in
 * placement_marketplace_settings. Any auto-created contract from the
 * /request-location deposit flow reads this default; per-contract
 * overrides still live on placement_contracts.platform_fee /
 * partner_payout for bespoke deals.
 */

const DEFAULT_TAKE_CENTS = 10000; // $100 — matches original tier seed

export interface MarketplaceSettings {
  platformTakeCents: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getMarketplaceSettings(): Promise<MarketplaceSettings> {
  const { data } = await supabaseAdmin
    .from("placement_marketplace_settings")
    .select("platform_take_cents, updated_at, updated_by")
    .limit(1)
    .maybeSingle();
  if (!data) {
    return { platformTakeCents: DEFAULT_TAKE_CENTS, updatedAt: null, updatedBy: null };
  }
  return {
    platformTakeCents: Number(data.platform_take_cents ?? DEFAULT_TAKE_CENTS),
    updatedAt: data.updated_at ?? null,
    updatedBy: data.updated_by ?? null,
  };
}

export async function setPlatformTakeCents(
  cents: number,
  updatedBy: string | null,
): Promise<MarketplaceSettings> {
  if (!Number.isFinite(cents) || cents < 0) {
    throw new Error("platform_take_cents must be a non-negative integer");
  }
  const takeCents = Math.round(cents);

  const { data: existing } = await supabaseAdmin
    .from("placement_marketplace_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("placement_marketplace_settings")
      .update({
        platform_take_cents: takeCents,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", existing.id)
      .select("platform_take_cents, updated_at, updated_by")
      .single();
    if (error) throw error;
    return {
      platformTakeCents: Number(data.platform_take_cents),
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("placement_marketplace_settings")
    .insert({ platform_take_cents: takeCents, updated_by: updatedBy })
    .select("platform_take_cents, updated_at, updated_by")
    .single();
  if (error) throw error;
  return {
    platformTakeCents: Number(data.platform_take_cents),
    updatedAt: data.updated_at,
    updatedBy: data.updated_by,
  };
}
