import { describe, it, expect } from "vitest";
import { generateGuestToken, hashGuestToken, hashNetworkIdentifier, hashesMatch, isWellFormedGuestToken } from "./guestToken";

describe("guest tokens", () => {
  it("generates 64-hex tokens and stores only a SHA-256 hash", () => {
    const t = generateGuestToken();
    expect(isWellFormedGuestToken(t)).toBe(true);
    const h = hashGuestToken(t);
    expect(h).not.toBe(t);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGuestToken(t)).toBe(h);
  });

  it("compares hashes in constant time and rejects mismatches", () => {
    const a = hashGuestToken(generateGuestToken());
    const b = hashGuestToken(generateGuestToken());
    expect(hashesMatch(a, a)).toBe(true);
    expect(hashesMatch(a, b)).toBe(false);
    expect(hashesMatch(a, null)).toBe(false);
    expect(hashesMatch(a, a.slice(1))).toBe(false);
  });

  it("rejects malformed cookie values", () => {
    expect(isWellFormedGuestToken("nope")).toBe(false);
    expect(isWellFormedGuestToken(undefined)).toBe(false);
  });

  it("hashes network identifiers with a key and never stores the raw value", () => {
    const env = { ASSISTANT_HASH_SECRET: "k" };
    const h = hashNetworkIdentifier("203.0.113.9", env);
    expect(h).not.toContain("203.0.113.9");
    expect(h).toMatch(/^[a-f0-9]{32}$/);
    expect(hashNetworkIdentifier("203.0.113.9", { ASSISTANT_HASH_SECRET: "other" })).not.toBe(h);
    expect(hashNetworkIdentifier(null, env)).toBeNull();
    expect(() => hashNetworkIdentifier("1.2.3.4", { NODE_ENV: "production" })).toThrow(/ASSISTANT_HASH_SECRET/);
    expect(() => hashNetworkIdentifier("1.2.3.4", { NODE_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: "svc" })).toThrow(/ASSISTANT_HASH_SECRET/);
  });
});
