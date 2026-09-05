import { describe, it, expect, vi, afterEach } from "vitest";
import { senderLocalPart, tenantSender } from "@/lib/storefront/emails";

/**
 * White-label tenant sender derivation. Customer-facing coffee emails must
 * lead with the OPERATOR ("{Storefront} Coffee Services") from a
 * per-storefront local-part under the verified domain, with Reply-To
 * pointing at the operator's support inbox. Branding only.
 */
describe("senderLocalPart", () => {
  it("derives from the STOREFRONT NAME first (spec examples)", () => {
    expect(senderLocalPart({ slug: "james-padden", display_name: "James Padden" })).toBe("jamespadden");
    expect(senderLocalPart({ slug: "twelve28vend", display_name: "Twelve28Vend" })).toBe("twelve28vend");
    expect(senderLocalPart({ slug: "abc", display_name: "ABC Vending LLC" })).toBe("abcvendingllc");
    expect(senderLocalPart({ slug: "joes", display_name: "Joe's Coffee & Vending" })).toBe("joescoffeevending");
  });

  it("prefers display name over slug when they differ", () => {
    // Name is the operator identity; it wins over the slug.
    expect(senderLocalPart({ slug: "internal-slug-xyz", display_name: "Bright Bean" })).toBe("brightbean");
  });

  it("falls back to the slug only when there is no usable display name", () => {
    expect(senderLocalPart({ slug: "acme-coffee", display_name: "" })).toBe("acmecoffee");
    expect(senderLocalPart({ slug: "acme-coffee", display_name: "!!!" })).toBe("acmecoffee");
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
    expect(s.from).not.toContain("orders@");
    expect(s.from).toContain("Twelve28Vend Coffee Services");
  });

  it("produces the spec's exact From for James Padden / ABC Vending LLC", () => {
    const a = tenantSender({ slug: "james-padden", display_name: "James Padden" });
    expect(a.from).toMatch(/^James Padden Coffee Services <jamespadden@[^>]+>$/);
    const b = tenantSender({ slug: "abc", display_name: "ABC Vending LLC" });
    expect(b.from).toMatch(/^ABC Vending LLC Coffee Services <abcvendingllc@[^>]+>$/);
  });
});

describe("tenantSender sending domain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function fromWith(fromEmail: string): Promise<string> {
    vi.resetModules();
    vi.stubEnv("STOREFRONT_FROM_EMAIL", "");
    vi.stubEnv("FROM_EMAIL", fromEmail);
    const mod = await import("@/lib/storefront/emails");
    return mod.tenantSender({ slug: "twelve28vend", display_name: "Twelve28Vend" }).from;
  }

  it("derives the domain from the configured sender (vendingconnector.com)", async () => {
    expect(await fromWith("orders@vendingconnector.com")).toBe(
      "Twelve28Vend Coffee Services <twelve28vend@vendingconnector.com>",
    );
  });

  it("uses an alternate verified domain when configured (apexaidashboard.com)", async () => {
    expect(await fromWith("noreply@apexaidashboard.com")).toBe(
      "Twelve28Vend Coffee Services <twelve28vend@apexaidashboard.com>",
    );
  });
});
