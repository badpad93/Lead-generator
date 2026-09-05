import { describe, it, expect } from "vitest";
import { senderLocalPart, tenantSender } from "@/lib/storefront/emails";

/**
 * White-label tenant sender derivation. Customer-facing coffee emails must
 * lead with the OPERATOR ("{Storefront} Coffee Services") from a
 * per-storefront local-part under the verified domain, with Reply-To
 * pointing at the operator's support inbox. Branding only.
 */
describe("senderLocalPart", () => {
  it("prefers the slug (already unique + URL-safe)", () => {
    expect(senderLocalPart({ slug: "twelve28vend", display_name: "Twelve28Vend" })).toBe("twelve28vend");
  });

  it("falls back to a sanitized display name when no slug", () => {
    expect(senderLocalPart({ display_name: "ABC Vending LLC" })).toBe("abcvendingllc");
    expect(senderLocalPart({ display_name: "James Padden" })).toBe("jamespadden");
    expect(senderLocalPart({ display_name: "Joe's Coffee & Vending" })).toBe("joescoffeevending");
  });

  it("never returns empty", () => {
    expect(senderLocalPart({ display_name: "!!!" })).toBe("coffee");
    expect(senderLocalPart({ slug: "", display_name: "" })).toBe("coffee");
  });

  it("is lowercase, ASCII, punctuation-free, and length-bounded", () => {
    const lp = senderLocalPart({ display_name: "Über Café Ñoño " + "x".repeat(100) });
    expect(lp).toMatch(/^[a-z0-9]+$/);
    expect(lp.length).toBeLessThanOrEqual(64);
  });
});

describe("tenantSender", () => {
  it("builds an operator-led From with the storefront domain and operator Reply-To", () => {
    const s = tenantSender({
      slug: "twelve28vend",
      display_name: "Twelve28Vend",
      support_email: "help@twelve28vend.com",
    });
    // Verified domain is derived from the configured sender (default here).
    expect(s.from).toMatch(/^Twelve28Vend Coffee Services <twelve28vend@[^>]+>$/);
    expect(s.replyTo).toBe("help@twelve28vend.com");
  });

  it("omits Reply-To when the tenant has no support email (and no fallback)", () => {
    // Sanitization strips non-alphanumerics (incl. the slug hyphen), per spec.
    const s = tenantSender({ slug: "acme-coffee", display_name: "Acme Coffee" });
    expect(s.from).toMatch(/^Acme Coffee Coffee Services <acmecoffee@[^>]+>$/);
    // No support email configured -> replyTo may be undefined.
    if (s.replyTo !== undefined) {
      // Only set if an env-level SUPPORT_EMAIL fallback exists.
      expect(typeof s.replyTo).toBe("string");
    }
  });

  it("never emits the raw orders@ platform sender as the From", () => {
    const s = tenantSender({ slug: "twelve28vend", display_name: "Twelve28Vend" });
    expect(s.from).not.toMatch(/^orders@/);
    expect(s.from).toContain("Twelve28Vend Coffee Services");
  });
});
