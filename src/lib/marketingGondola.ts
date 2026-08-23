/**
 * Shared constants for the marketing gondola image uploader flow.
 * Kept in one place so the migration CHECK constraint, the public
 * fetch endpoint, the admin upload endpoint, the admin page, and
 * the gondola component all agree on the same 5 slot ids.
 */

export const GONDOLA_SLOTS = [
  "coffee",
  "10-10-10",
  "financing",
  "ai-vending",
  "website-services",
] as const;

export type GondolaSlot = (typeof GONDOLA_SLOTS)[number];

export function isGondolaSlot(v: unknown): v is GondolaSlot {
  return typeof v === "string" && (GONDOLA_SLOTS as readonly string[]).includes(v);
}

export const GONDOLA_BUCKET = "marketing-gondola";

// Human-readable label per slot for the admin uploader UI.
export const GONDOLA_SLOT_LABELS: Record<GondolaSlot, string> = {
  coffee: "Coffee Service",
  "10-10-10": "10 / 10 / 10 Promotion",
  financing: "Financing",
  "ai-vending": "AI Vending Machines",
  "website-services": "Website Services",
};

// 15 MB per image — matches the website-request media cap and is
// well within Supabase Storage's per-object default.
export const GONDOLA_MAX_BYTES = 15 * 1024 * 1024;

export const GONDOLA_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
