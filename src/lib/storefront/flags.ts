/**
 * Storefront feature-flag reader.
 *
 * Every customer-facing storefront path checks a flag here before
 * doing anything user-visible. Three flags today:
 *   storefront.public_pages_enabled  — /coffee/o/{slug}
 *   storefront.enrollment_enabled    — invitation preview + consume
 *   storefront.checkout_enabled      — /api/storefront/checkout
 *                                       (+ the /api/storefront/quote
 *                                        preview, since a priceable
 *                                        cart the customer can't buy
 *                                        is worse than not showing one)
 *
 * Semantics (all four are load-bearing):
 *
 *   Fail CLOSED. Missing row, DB error, or malformed value all
 *   resolve to `false`. An outage-induced "off" is correct; an
 *   outage-induced "on" is not.
 *
 *   Server-side only. This module imports supabaseAdmin. No flag
 *   value ever reaches the client bundle. Callers must be server
 *   components, route handlers, or server actions.
 *
 *   Cached in-process for FLAG_TTL_MS (45s). That's short enough
 *   that flipping a flag in Supabase takes effect within about a
 *   minute without a redeploy — and long enough that hot paths
 *   don't hit the DB every request. If you're pushing the cache
 *   past ~60s, that's tantamount to "needs a redeploy to flip",
 *   which defeats the purpose of a kill switch.
 *
 *   Uniform enforcement. Public pages return the same 404 as
 *   "tenant not found" when disabled — never leak that a
 *   storefront exists but is switched off. API routes may return
 *   503, since the caller has already shown they know something
 *   specific (a token, an enrolled session).
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type StorefrontFlagKey =
  | "storefront.public_pages_enabled"
  | "storefront.enrollment_enabled"
  | "storefront.checkout_enabled";

const FLAG_TTL_MS = 45_000;

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}
const cache = new Map<StorefrontFlagKey, CacheEntry>();

/**
 * Look up a flag with fail-closed semantics and short-TTL caching.
 * Never throws — a DB error becomes a cached `false` for the TTL.
 */
export async function isStorefrontFlagEnabled(key: StorefrontFlagKey): Promise<boolean> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  let enabled = false;
  try {
    const { data, error } = await supabaseAdmin
      .from("platform_feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (!error && data) {
      // Coerce defensively: the column is bool in Postgres, but a
      // future schema change or a bad row shouldn't accidentally
      // resolve to truthy for any non-boolean value.
      enabled = (data as { enabled: unknown }).enabled === true;
    }
  } catch (err) {
    console.warn("[storefront/flags] read failed, treating as disabled:", (err as Error).message);
  }

  cache.set(key, { value: enabled, expiresAt: now + FLAG_TTL_MS });
  return enabled;
}

/**
 * Test helper — never call from application code. Flushes the
 * in-process cache so tests can assert on the DB lookup path.
 */
export function __resetStorefrontFlagCacheForTests(): void {
  cache.clear();
}
