import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMachinesForBrand, type SmartCoolerMachine } from "@/lib/smartCoolerMachines";

/**
 * AI Vending Brands — public brand pages whose lineups are the Smart Coolers
 * (AI cooler) inventory, assigned via smart_cooler_machines.brand_id.
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

export interface BrandDetail {
  id: string;
  name: string;
  slug: string;
  blurb: string;
  logoUrl: string | null;
  machines: SmartCoolerMachine[];
}

/** An active brand and its Smart Coolers lineup, by slug. Null if not found/inactive. */
export async function getBrandBySlug(slug: string): Promise<BrandDetail | null> {
  const { data: brand } = await supabaseAdmin
    .from("vending_brands")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!brand) return null;

  const machines = await getMachinesForBrand(String(brand.id));

  return {
    id: String(brand.id),
    name: (brand.name as string) ?? "",
    slug: (brand.slug as string) ?? "",
    blurb: (brand.blurb as string) ?? "",
    logoUrl: brandLogoUrl((brand.logo_path as string) ?? null, brand.updated_at as string | null),
    machines,
  };
}

async function machineCountsByBrand(): Promise<Record<string, number>> {
  const { data } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("brand_id")
    .eq("active", true)
    .not("brand_id", "is", null);
  const counts: Record<string, number> = {};
  for (const row of data || []) {
    const id = String((row as { brand_id: string }).brand_id);
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
