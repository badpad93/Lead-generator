import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Smart Coolers landing-page machine grid (/smart-coolers).
 *
 * Content lives in the `smart_cooler_machines` table (admin-editable) with
 * photos in the public `smart-cooler-machines` bucket. Writes go through the
 * service role; the public page reads active machines ordered by sort_order.
 */

export const SMART_COOLER_BUCKET = "smart-cooler-machines";
export const MACHINE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
export const MACHINE_ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

// Spec sheets may be a PDF or an image, and can be a bit larger.
export const SPEC_MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const SPEC_ALLOWED_MIME = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

export function extensionFromMime(mime: string): string {
  if (mime === "application/pdf") return ".pdf";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

/** A machine as rendered on the public page. */
export interface SmartCoolerMachine {
  id: string;
  name: string;
  bottles: string;
  shelves: string;
  cameras: string;
  warranty: string;
  startingAt: string;
  imageUrl: string | null;
  specUrl: string | null;
}

/** Shipped fallback used when the DB is unavailable or empty (mirrors the seed). */
export const FALLBACK_MACHINES: Omit<SmartCoolerMachine, "id">[] = [
  { name: "Micromart Fridge Smart Store", bottles: "378 bottles", shelves: "5 shelves", cameras: "4x cameras", warranty: "3/5 year warranty", startingAt: "$6,295", imageUrl: null, specUrl: null },
  { name: "Summit Pro 542 AI Smart Cooler", bottles: "378 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$4,699", imageUrl: null, specUrl: null },
  { name: "Summit Plus 440 AI Smart Cooler", bottles: "324 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$3,850", imageUrl: null, specUrl: null },
  { name: "Vantage Elite Smart Cooler", bottles: "450 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$5,999", imageUrl: null, specUrl: null },
  { name: "Vantage Prime Smart Cooler", bottles: "360 bottles", shelves: "5 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$4,999", imageUrl: null, specUrl: null },
  { name: "Corner Core AI Smart Cooler", bottles: "300+ bottles", shelves: "6 shelves", cameras: "3x cameras", warranty: "2/5 year warranty", startingAt: "$3,995", imageUrl: null, specUrl: null },
  { name: "Summit Ultra 1200 AI Smart Cooler", bottles: "756 bottles", shelves: "12 shelves", cameras: "4x cameras", warranty: "1 year warranty", startingAt: "$7,199", imageUrl: null, specUrl: null },
  { name: "Summit Mini 360 AI Smart Cooler", bottles: "252 bottles", shelves: "6 shelves", cameras: "2x cameras", warranty: "1 year warranty", startingAt: "$3,449", imageUrl: null, specUrl: null },
];

/** Resolve a stored object key to a public URL with a cache-buster. */
export function machineImageUrl(imagePath: string | null, updatedAt?: string | null): string | null {
  if (!imagePath) return null;
  const { data } = supabaseAdmin.storage.from(SMART_COOLER_BUCKET).getPublicUrl(imagePath);
  const url = data?.publicUrl;
  if (!url) return null;
  const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
  return `${url}?v=${v}`;
}

function toPublic(row: Record<string, unknown>): SmartCoolerMachine {
  const str = (key: string) => (row[key] as string) ?? "";
  const updatedAt = row.updated_at as string | null;
  return {
    id: String(row.id),
    name: str("name"),
    bottles: str("bottles"),
    shelves: str("shelves"),
    cameras: str("cameras"),
    warranty: str("warranty"),
    startingAt: str("starting_at"),
    imageUrl: machineImageUrl((row.image_path as string) ?? null, updatedAt),
    specUrl: machineImageUrl((row.spec_path as string) ?? null, updatedAt),
  };
}

/**
 * Active machines for the public page, ordered by sort_order. Falls back to the
 * shipped list if the table is empty or the read fails, so the page never breaks.
 */
export async function getSmartCoolerMachines(): Promise<SmartCoolerMachine[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("smart_cooler_machines")
      .select("*")
      .eq("active", true)
      .order("sort_order", { ascending: true });
    if (error || !data || data.length === 0) {
      return FALLBACK_MACHINES.map((m, i) => ({ ...m, id: `fallback-${i}` }));
    }
    return data.map(toPublic);
  } catch {
    return FALLBACK_MACHINES.map((m, i) => ({ ...m, id: `fallback-${i}` }));
  }
}
