import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * Part 1 regression scan — customer-facing tenant storefront surfaces must
 * carry NO Vending Connector cosmetic attribution. We assert against the
 * rendered/string content of each surface (comment lines stripped, so the
 * explanatory code comments about white-labeling don't trip the scan).
 *
 * Deliberately allowed and NOT scanned away: the merchant-of-record legal
 * disclosures ("Fulfilled by Vending Connector on behalf of X", "Vending
 * Connector ships every order…", the storefront footer fulfillment line).
 * Those are flagged in the PR as legally-framed and intentionally retained,
 * so this test forbids only the two prohibited COSMETIC phrases, not every
 * "Vending Connector" mention.
 */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

/** Drop whole-line comments (JSDoc/`//`/block) so explanatory comments about
 *  the white-labeling don't count as customer-facing copy. Inline `https://`
 *  is safe because we only drop lines whose TRIMMED start is a comment marker. */
function stripCommentLines(src: string): string {
  return src
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("/*") || t.startsWith("*"));
    })
    .join("\n");
}

/** Customer-facing tenant storefront surfaces. */
const CUSTOMER_SURFACES = [
  "src/app/components/AuthBrandHeader.tsx",
  "src/app/coffee/o/[slug]/page.tsx",
  "src/app/coffee/invite/[token]/page.tsx",
  "src/app/coffee/quote/[token]/page.tsx",
  "src/app/login/LoginClient.tsx",
  "src/app/signup/SignupClient.tsx",
  "src/app/verify-email/VerifyEmailClient.tsx",
  "src/lib/storefront/emails.ts",
  "src/lib/emailVerification.ts",
];

const PROHIBITED = [
  /Powered by Vending Connector/i,
  /permanently linked to Vending Connector/i,
  /Vending Connector account is permanently linked/i,
];

describe("white-labeling: prohibited cosmetic VC phrases absent from customer surfaces", () => {
  for (const rel of CUSTOMER_SURFACES) {
    it(`${rel} has no prohibited cosmetic VC attribution`, () => {
      const code = stripCommentLines(read(rel));
      for (const re of PROHIBITED) {
        expect(re.test(code), `${rel} must not contain ${re}`).toBe(false);
      }
    });
  }
});

describe("white-labeling: tenant branding is used where available", () => {
  it("AuthBrandHeader renders the tenant display name and no VC byline", () => {
    const src = stripCommentLines(read("src/app/components/AuthBrandHeader.tsx"));
    expect(src).toContain("{brand.display_name}");
    expect(/Powered by Vending Connector/.test(src)).toBe(false);
  });
  it("storefront home uses an absolute title (no '| Vending Connector' template leak)", () => {
    const src = read("src/app/coffee/o/[slug]/page.tsx");
    expect(src).toContain("absolute:");
  });
  it("public quote page sets an absolute (neutral) metadata title", () => {
    const src = read("src/app/coffee/quote/[token]/page.tsx");
    expect(src).toContain('title: { absolute: "Quote" }');
  });
});

describe("white-labeling: internal VC branding is preserved", () => {
  it("the generic (non-storefront) login branch still shows Vending Connector", () => {
    // LoginClient keeps VC branding for VC-direct (non-storefront) sign-in.
    expect(read("src/app/login/LoginClient.tsx")).toContain("Vending Connector");
  });
  it("the merchant-of-record legal disclosure is intentionally retained", () => {
    // Flagged in the PR; must NOT be silently removed.
    expect(read("src/lib/storefront/emails.ts")).toContain(
      "Fulfilled by Vending Connector on behalf of",
    );
  });
});
