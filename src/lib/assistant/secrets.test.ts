import { describe, it, expect } from "vitest";
import { assistantHashSecret, AssistantSecretMissingError } from "./secrets";
import { hashNetworkIdentifier } from "./guestToken";
import { signQuoteRef } from "@/lib/commerce/financingLink";

/**
 * ASSISTANT_HASH_SECRET is a dedicated value. It never falls back to the
 * service-role key, may not equal it, and a missing value fails closed
 * outside the test runner.
 */
describe("assistantHashSecret", () => {
  it("returns the dedicated value when set", () => {
    expect(assistantHashSecret({ ASSISTANT_HASH_SECRET: "dedicated", SUPABASE_SERVICE_ROLE_KEY: "service" })).toBe("dedicated");
  });
  it("never falls back to the service-role key outside tests", () => {
    for (const nodeEnv of ["production", "development", undefined]) {
      const env = { NODE_ENV: nodeEnv, SUPABASE_SERVICE_ROLE_KEY: "service-role-key" };
      expect(() => assistantHashSecret(env)).toThrow(AssistantSecretMissingError);
      expect(() => hashNetworkIdentifier("203.0.113.9", env)).toThrow(AssistantSecretMissingError);
      expect(() => signQuoteRef("11111111-1111-4111-8111-000000000001", env)).toThrow(AssistantSecretMissingError);
    }
  });
  it("rejects a value that equals the service-role key and an empty value", () => {
    expect(() => assistantHashSecret({ NODE_ENV: "production", ASSISTANT_HASH_SECRET: "same", SUPABASE_SERVICE_ROLE_KEY: "same" })).toThrow(AssistantSecretMissingError);
    expect(() => assistantHashSecret({ NODE_ENV: "production", ASSISTANT_HASH_SECRET: "   " })).toThrow(AssistantSecretMissingError);
  });
  it("produces output that does not depend on the service-role key", () => {
    const a = hashNetworkIdentifier("203.0.113.9", { ASSISTANT_HASH_SECRET: "k", SUPABASE_SERVICE_ROLE_KEY: "one" });
    const b = hashNetworkIdentifier("203.0.113.9", { ASSISTANT_HASH_SECRET: "k", SUPABASE_SERVICE_ROLE_KEY: "two" });
    expect(a).toBe(b);
  });
  it("uses a fixed, clearly non-deployable value only under the test runner", () => {
    expect(assistantHashSecret({ NODE_ENV: "test" })).toMatch(/not-for-deployment/);
  });
});
