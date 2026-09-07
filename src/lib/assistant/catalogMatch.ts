/**
 * In-app text matching for catalog searches.
 *
 * The model fills `query` with the customer's words ("coffee options",
 * "vending machines for sale"). A PostgREST `ilike '%coffee options%'`
 * on name/description matches nothing for a product named "House Blend
 * Whole Bean 5lb", so the previous implementation returned an empty
 * catalog for perfectly ordinary questions. Rows are now fetched with the
 * canonical visibility filters only and ranked here by whole-word token
 * hits across the public text fields (including the category name).
 * No database syntax is built from user text.
 */
export const MAX_TOKENS = 6;
const STOP = new Set([
  "the", "and", "for", "with", "a", "an", "of", "to", "me", "my", "some", "any", "are", "is", "what", "which", "show", "find", "list",
  "options", "option", "products", "product", "items", "item", "right", "now", "available", "sale", "buy", "order", "three", "two", "few",
]);

/** Words that describe a whole catalog rather than an item within it. */
export const KIND_GENERIC_WORDS: Record<string, readonly string[]> = {
  coffee: ["supplies", "supply"],
  machine: ["vending", "machine", "machines", "equipment", "listing", "listings", "used"],
  location_service: ["location", "locations", "service", "services", "placement"],
};

function usable(word: string, generic: readonly string[]): boolean {
  return word.length >= 2 && !STOP.has(word) && !generic.includes(word);
}

/** Lower-cased search tokens: letters/digits only, ≥2 chars, stop and kind-generic words removed. */
export function searchTokens(q: string | null, generic: readonly string[] = []): string[] {
  const words = (q ?? "").toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const unique = Array.from(new Set(words.filter((w) => usable(w, generic))));
  return unique.slice(0, MAX_TOKENS);
}

/** Singular/plural-tolerant containment: "machines" matches "machine" and vice versa. */
function hit(hay: string, token: string): boolean {
  const stem = token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token;
  return hay.includes(stem);
}

/** Number of tokens found in the haystack. */
export function tokenHits(hay: string, tokens: string[]): number {
  const h = hay.toLowerCase();
  return tokens.reduce((n, t) => n + (hit(h, t) ? 1 : 0), 0);
}

/**
 * Rows with at least one token hit, best matches first, original order
 * preserved among equals. Returns [] when nothing matches so the caller
 * can decide how to fall back.
 */
export function rankByTokens<T>(rows: T[], text: (row: T) => string, tokens: string[]): T[] {
  if (tokens.length === 0) return rows;
  const scored = rows.map((row, i) => ({ row, i, score: tokenHits(text(row), tokens) })).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  return scored.map((s) => s.row);
}

/** Loose slug/name match for category lookups ("coffee" ~ "coffee-beans", "Ground Coffee"). */
export function categoryMatches(slug: string, candidate: { slug: string; name: string }): boolean {
  const s = slug.toLowerCase();
  return candidate.slug.toLowerCase() === s || candidate.slug.toLowerCase().includes(s) || candidate.name.toLowerCase().includes(s.replace(/-/g, " "));
}
