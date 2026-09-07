/**
 * Format a stored date-only string (e.g. "2026-09-07") for display in a
 * contract, anchored to LOCAL midnight so the calendar date never shifts.
 *
 * `new Date("2026-09-07")` parses as UTC midnight; `toLocaleDateString` then
 * renders it in the local zone. In any negative-UTC-offset locale (all of the
 * US) that is the PREVIOUS calendar day — so a Sept 7 effective_date rendered
 * "September 6, 2026". Appending "T00:00:00" forces local-time parsing, which
 * preserves the intended calendar date. (Values that already carry a time are
 * left as-is.)
 */
export function formatContractDate(
  dateStr: string | null | undefined,
  fallback = "________________",
): string {
  if (!dateStr) return fallback;
  const s = String(dateStr);
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
