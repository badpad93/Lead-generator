import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * AI Vending Brands — public brand pages whose lineups are the existing
 * sellable `machine_listings` (assigned via machine_listings.brand_id).
 * Public-read; writes go through the service role. Logos in a public bucket.
 */

export const BRAND_LOGO_BUCKET = "vending-brand-logos";
export const BRAND_LOGO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const BRAND_LOGO_ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export function brandLogoExtension(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/svg+xml") return ".svg";
  return ".jpg";
}

/** A URL-safe slug from a brand name. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export interface VendingBrand {
  id: string;
  name: string;
  slug: string;
  blurb: string;
  logoUrl: string | null;
  machineCount: number;
}

/** Resolve a stored logo key to a public URL with a cache-buster. */
export function brandLogoUrl(logoPath: string | null, updatedAt?: string | null): string | null {
  if (!logoPath) return null;
  const { data } = supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).getPublicUrl(logoPath);
  const url = data?.publicUrl;
  if (!url) return null;
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `${url}?v=${v}`;
}

/** Active brands for the public "AI Vending Brands" section, ordered, with machine counts. */
export async function getPublicBrands(): Promise<VendingBrand[]> {
  try {
    const { data: brands, error } = await supabaseAdmin
      .from("vending_brands")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error || !brands) return [];

    // Count active, sellable machines per brand in one query.
    const counts = await machineCountsByBrand();
    return brands.map((b) => ({
      id: String(b.id),
      name: (b.name as string) ?? "",
      slug: (b.slug as string) ?? "",
      blurb: (b.blurb as string) ?? "",
      logoUrl: brandLogoUrl((b.logo_path as string) ?? null, b.updated_at as string | null),
      machineCount: counts[String(b.id)] ?? 0,
    }));
  } catch {
    return [];
  }
}

async function machineCountsByBrand(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from("machine_listings")
    .select("brand_id")
    .eq("status", "active")
    .not("brand_id", "is", null);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const id = String((row as { brand_id: string }).brand_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
