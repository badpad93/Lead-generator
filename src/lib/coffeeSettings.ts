import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Coffee marketplace settings — org-wide policy knobs read at checkout
 * time and rendered on the shop / cart / checkout UIs.
 *
 * Singleton table (see migration 142). We always read the newest row
 * so if an admin ever forks a second row through direct SQL it still
 * behaves sanely. Missing row → defaults (never a crash).
 */

export interface CoffeeSettings {
  id: string | null;
  minimum_order_cents: number;
  minimum_order_enforced: boolean;
  updated_at: string | null;
}

const DEFAULTS: CoffeeSettings = {
  id: null,
  minimum_order_cents: 50000, // $500
  minimum_order_enforced: true,
  updated_at: null,
};

export async function getCoffeeSettings(): Promise<CoffeeSettings> {
  const { data } = await supabaseAdmin
    .from("coffee_settings")
    .select("id, minimum_order_cents, minimum_order_enforced, updated_at")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!data) return DEFAULTS;
  return {
    id: data.id,
    minimum_order_cents: Number(data.minimum_order_cents) || 0,
    minimum_order_enforced: !!data.minimum_order_enforced,
    updated_at: data.updated_at,
  };
}

export async function updateCoffeeSettings(
  patch: Partial<Pick<CoffeeSettings, "minimum_order_cents" | "minimum_order_enforced">>,
  updatedBy: string,
): Promise<CoffeeSettings> {
  const current = await getCoffeeSettings();

  const nextMinimum =
    patch.minimum_order_cents != null ? Math.max(0, Math.floor(patch.minimum_order_cents)) : current.minimum_order_cents;
  const nextEnforced = patch.minimum_order_enforced != null ? !!patch.minimum_order_enforced : current.minimum_order_enforced;

  if (current.id) {
    const { data, error } = await supabaseAdmin
      .from("coffee_settings")
      .update({
        minimum_order_cents: nextMinimum,
        minimum_order_enforced: nextEnforced,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", current.id)
      .select("id, minimum_order_cents, minimum_order_enforced, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      minimum_order_cents: Number(data.minimum_order_cents),
      minimum_order_enforced: !!data.minimum_order_enforced,
      updated_at: data.updated_at,
    };
  }

  // No row yet — insert the first singleton with the requested values.
  const { data, error } = await supabaseAdmin
    .from("coffee_settings")
    .insert({
      minimum_order_cents: nextMinimum,
      minimum_order_enforced: nextEnforced,
      updated_by: updatedBy,
    })
    .select("id, minimum_order_cents, minimum_order_enforced, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    minimum_order_cents: Number(data.minimum_order_cents),
    minimum_order_enforced: !!data.minimum_order_enforced,
    updated_at: data.updated_at,
  };
}
