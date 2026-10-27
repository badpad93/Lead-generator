import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Location Services — hire a locator on a recurring weekly basis.
 *
 * Admin-managed locator profiles (public page /locators). A customer picks a
 * locator + hours/week (multiples of 5, minimum 15); the weekly amount
 * (hourly x hours) is charged up front and re-billed weekly by a scheduled
 * sweep until cancelled or a week goes unpaid.
 */

export {
  HOURS_MIN, HOURS_STEP, HOURS_MAX, extensionFromMime, validHours, weeklyAmountCents,
} from "@/lib/locationServicesMath";

export const LOCATOR_BUCKET = "location-service-locators";
export const HEADSHOT_MAX_BYTES = 4 * 1024 * 1024; // 4 MB (under the serverless body limit)
export const HEADSHOT_ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export interface PublicLocator {
  id: string;
  name: string;
  headline: string;
  bio: string;
  region: string;
  hourlyRateCents: number;
  headshotUrl: string | null;
}

/** Resolve a stored headshot key to a public URL with a cache-buster. */
export function headshotUrl(path: string | null, updatedAt?: string | null): string | null {
  if (!path) return null;
  const { data } = supabaseAdmin.storage.from(LOCATOR_BUCKET).getPublicUrl(path);
  const url = data?.publicUrl;
  if (!url) return null;
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `${url}?v=${v}`;
}

function toPublic(row: Record<string, unknown>): PublicLocator {
  const str = (k: string) => (row[k] as string) ?? "";
  return {
    id: String(row.id),
    name: str("name"),
    headline: str("headline"),
    bio: str("bio"),
    region: str("region"),
    hourlyRateCents: (row.hourly_rate_cents as number) ?? 0,
    headshotUrl: headshotUrl((row.headshot_path as string) ?? null, row.updated_at as string | null),
  };
}

/** Active locator profiles for the public /locators page, ordered. */
export async function getPublicLocators(): Promise<PublicLocator[]> {
  try {
    const { data } = await supabaseAdmin
      .from("location_service_locators")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    return (data || []).map(toPublic);
  } catch {
    return [];
  }
}

export interface SellableLocator extends PublicLocator {
  active: boolean;
}

/** A single active locator for the checkout page (null if missing/inactive). */
export async function getSellableLocator(id: string): Promise<SellableLocator | null> {
  const { data } = await supabaseAdmin
    .from("location_service_locators")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!data || !data.active || !data.hourly_rate_cents || (data.hourly_rate_cents as number) <= 0) return null;
  return { ...toPublic(data), active: Boolean(data.active) };
}
