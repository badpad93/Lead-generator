import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Flag reader tests — cover the four load-bearing rules:
 *   - Fail closed when the row is missing
 *   - Fail closed on DB error
 *   - Only `enabled === true` resolves to true (defensive coercion)
 *   - Cache serves within the TTL; a reset picks up new DB state
 */

let scenario: { rows: Array<{ key: string; enabled: unknown }>; throwOnRead: boolean };

vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from() {
      return {
        select: () => ({
          eq: (_col: string, val: unknown) => ({
            maybeSingle: async () => {
              if (scenario.throwOnRead) throw new Error("db down");
              const row = scenario.rows.find((r) => r.key === val);
              return { data: row ?? null, error: null };
            },
          }),
        }),
      };
    },
  },
}));

import { isStorefrontFlagEnabled, __resetStorefrontFlagCacheForTests } from "./flags";

beforeEach(() => {
  scenario = { rows: [], throwOnRead: false };
  __resetStorefrontFlagCacheForTests();
});

describe("isStorefrontFlagEnabled — fail closed", () => {
  it("returns false when the row is missing", async () => {
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(false);
  });

  it("returns false when the DB read throws", async () => {
    scenario.throwOnRead = true;
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(false);
  });

  it("returns false when enabled is anything other than boolean true", async () => {
    scenario.rows = [
      { key: "storefront.checkout_enabled", enabled: "true" },
    ];
    // Defensive coercion — the string "true" is not the boolean true.
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(false);
  });

  it("returns true only for boolean true", async () => {
    scenario.rows = [{ key: "storefront.checkout_enabled", enabled: true }];
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(true);
  });
});

describe("isStorefrontFlagEnabled — caching", () => {
  it("caches within TTL — flipping DB doesn't take effect until reset", async () => {
    scenario.rows = [{ key: "storefront.checkout_enabled", enabled: true }];
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(true);
    // Now the DB says false, but cache is warm
    scenario.rows = [{ key: "storefront.checkout_enabled", enabled: false }];
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(true);
    // Simulate cache TTL expiry
    __resetStorefrontFlagCacheForTests();
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(false);
  });

  it("caches the fail-closed value too — DB error survives the TTL", async () => {
    scenario.throwOnRead = true;
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(false);
    // DB comes back and is TRUE, but cache is still holding false
    scenario.throwOnRead = false;
    scenario.rows = [{ key: "storefront.checkout_enabled", enabled: true }];
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(false);
    // Reset and confirm the new state
    __resetStorefrontFlagCacheForTests();
    expect(await isStorefrontFlagEnabled("storefront.checkout_enabled")).toBe(true);
  });
});
