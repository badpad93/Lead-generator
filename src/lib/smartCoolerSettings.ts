import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Smart Coolers (AI coolers) settings — singleton row. Currently the
 * admin-editable lead-time / estimated-delivery banner shown on the machine
 * purchase surfaces. Missing row → defaults (never a crash).
 */

export interface SmartCoolerSettings {
  id: string | null;
  bannerEnabled: boolean;
  bannerMessage: string;
  updatedAt: string | null;
}

const DEFAULTS: SmartCoolerSettings = { id: null, bannerEnabled: false, bannerMessage: "", updatedAt: null };

function fromRow(data: Record<string, unknown> | null): SmartCoolerSettings {
  if (!data) return DEFAULTS;
  return {
    id: (data.id as string) ?? null,
    bannerEnabled: !!data.purchase_banner_enabled,
    bannerMessage: (data.purchase_banner_message as string) ?? "",
    updatedAt: (data.updated_at as string) ?? null,
  };
}

export async function getSmartCoolerSettings(): Promise<SmartCoolerSettings> {
  try {
    const { data } = await supabaseAdmin
      .from("smart_cooler_settings")
      .select("id, purchase_banner_enabled, purchase_banner_message, updated_at")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    return fromRow(data);
  } catch {
    return DEFAULTS;
  }
}

export async function updateSmartCoolerSettings(
  patch: { bannerEnabled?: boolean; bannerMessage?: string },
  updatedBy: string,
): Promise<SmartCoolerSettings> {
  const current = await getSmartCoolerSettings();
  const row = {
    purchase_banner_enabled: patch.bannerEnabled != null ? !!patch.bannerEnabled : current.bannerEnabled,
    purchase_banner_message: patch.bannerMessage != null ? String(patch.bannerMessage).slice(0, 500) : current.bannerMessage,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const select = "id, purchase_banner_enabled, purchase_banner_message, updated_at";
  if (current.id) {
    const { data, error } = await supabaseAdmin.from("smart_cooler_settings").update(row).eq("id", current.id).select(select).single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  }
  const { data, error } = await supabaseAdmin.from("smart_cooler_settings").insert(row).select(select).single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}
