/**
 * Pure helpers for Location Services (no Supabase import, so they're unit
 * testable). Re-exported from locationServices.ts for callers.
 */

export const HOURS_MIN = 15;
export const HOURS_STEP = 5;
export const HOURS_MAX = 40;

export function extensionFromMime(mime: string): string {
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

/** Valid weekly hours: an integer multiple of 5, from 15 up to 40. */
export function validHours(h: unknown): h is number {
  return typeof h === "number" && Number.isInteger(h) && h >= HOURS_MIN && h <= HOURS_MAX && h % HOURS_STEP === 0;
}

/** Weekly charge in cents = hourly rate (cents) x hours. */
export function weeklyAmountCents(hourlyRateCents: number, hours: number): number {
  return Math.round(hourlyRateCents) * hours;
}
