import { describe, it, expect } from "vitest";
import { CANONICAL_DOMAIN, canonicalRedirectTarget, isProductionDeployment } from "./canonicalHost";

const REQ = "https://lead-generator-git-branch-team.vercel.app/coffee/o/twelve28?storefront=twelve28&x=1";

describe("canonicalRedirectTarget", () => {
  it("redirects a noncanonical host to vendingconnector.com in production, keeping path and query", () => {
    const t = canonicalRedirectTarget(REQ, "lead-generator-git-branch-team.vercel.app", { VERCEL_ENV: "production" });
    expect(t?.toString()).toBe(`https://${CANONICAL_DOMAIN}/coffee/o/twelve28?storefront=twelve28&x=1`);
  });

  it("forces https and drops an explicit port in production", () => {
    const t = canonicalRedirectTarget("http://old-host.example:8080/pricing?a=b", "old-host.example:8080", { VERCEL_ENV: "production" });
    expect(t?.protocol).toBe("https:");
    expect(t?.port).toBe("");
    expect(t?.pathname).toBe("/pricing");
    expect(t?.search).toBe("?a=b");
  });

  it("does not redirect the canonical hosts or localhost in production", () => {
    const env = { VERCEL_ENV: "production" };
    expect(canonicalRedirectTarget(REQ, CANONICAL_DOMAIN, env)).toBeNull();
    expect(canonicalRedirectTarget(REQ, `www.${CANONICAL_DOMAIN}`, env)).toBeNull();
    expect(canonicalRedirectTarget(REQ, "localhost:3000", env)).toBeNull();
    expect(canonicalRedirectTarget(REQ, null, env)).toBeNull();
  });

  it("never redirects on preview, development, test, or unset VERCEL_ENV, even with NODE_ENV=production", () => {
    for (const env of [
      { VERCEL_ENV: "preview", NODE_ENV: "production" },
      { VERCEL_ENV: "development", NODE_ENV: "production" },
      { VERCEL_ENV: "test", NODE_ENV: "production" },
      { NODE_ENV: "production" },
      {},
    ]) {
      expect(canonicalRedirectTarget(REQ, "lead-generator-git-branch-team.vercel.app", env)).toBeNull();
      expect(isProductionDeployment(env)).toBe(false);
    }
    expect(isProductionDeployment({ VERCEL_ENV: "production" })).toBe(true);
  });
});
