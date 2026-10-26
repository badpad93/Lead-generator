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

/**
 * A brand slug guaranteed not to collide, suffixing -2, -3, … when the base
 * is taken. Used on create (where the slug is auto-generated) so adding a
 * brand never fails just because the name repeats.
 */
export async function uniqueBrandSlug(base: string): Promise<string> {
  const safe = slugify(base) || `brand-${Date.now()}`;
  const { data } = await supabaseAdmin
    .from("vending_brands")
    .select("slug")
    .like("slug", `${safe}%`);
  const taken = new Set((data || []).map((r) => (r as { slug: string }).slug));
  if (!taken.has(safe)) return safe;
  let n = 2;
  while (taken.has(`${safe}-${n}`)) n++;
  return `${safe}-${n}`;
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

export interface BrandShowcaseItem {
  brandSlug: string;
  brandName: string;
  brandBlurb: string;
  brandLogoUrl: string | null;
  machineCount: number;
  machine: SmartCoolerMachine;
}

/**
 * One representative machine per active brand (the brand's first by sort
 * order), for the landing page's brand showcase. Each links to the brand's
 * full lineup rather than overwhelming the page with every machine.
 */
export async function getBrandShowcase(): Promise<BrandShowcaseItem[]> {
  const { data: brands } = await supabaseAdmin
    .from("vending_brands")
    .select("id, name, slug, blurb, logo_path, updated_at")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (!brands || brands.length === 0) return [];

  const items: BrandShowcaseItem[] = [];
  for (const b of brands) {
    const machines = await getMachinesForBrand(String(b.id));
    if (machines.length > 0) {
      items.push({
        brandSlug: String(b.slug),
        brandName: String(b.name),
        brandBlurb: (b.blurb as string) ?? "",
        brandLogoUrl: brandLogoUrl((b.logo_path as string) ?? null, b.updated_at as string | null),
        machineCount: machines.length,
        machine: machines[0],
      });
    }
  }
  return items;
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
