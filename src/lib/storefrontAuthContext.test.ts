import { describe, it, expect, vi } from "vitest";

/**
 * Auth-context resolver tests — the durable storefront branding layer.
 *
 * These cover the SECURITY-sensitive pure logic:
 *   - precedence of the slug sources (param > invite > cookie > user)
 *   - slug validation (a forged/garbage slug never resolves)
 *   - the open-redirect guard on post-auth redirect targets
 *
 * The DB is mocked away — resolveAuthSlug only touches it via the
 * invite-token cookie path, which these cases deliberately omit so
 * the precedence logic is exercised in isolation.
 */

// Import gate: the module pulls in supabaseAdmin (env-guarded) transitively.
vi.mock("@/lib/supabaseAdmin", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
      }),
    }),
  },
}));

import {
  pickSlug,
  isSafeRelativePath,
  storefrontHomePath,
  readSfCtxSlug,
  resolveAuthSlug,
  SF_CTX_COOKIE,
  type CookieReader,
} from "@/lib/storefrontAuthContext";

/** Minimal cookie store backed by a plain map. */
function cookieStore(entries: Record<string, string>): CookieReader {
  return {
    get(name: string) {
      return name in entries ? { value: entries[name] } : undefined;
    },
  };
}

describe("pickSlug", () => {
  it("returns the first syntactically valid slug", () => {
    expect(pickSlug([null, "", "acme-coffee"])).toBe("acme-coffee");
  });

  it("skips invalid slugs", () => {
    // Uppercase, too short, and path-injection attempts are all rejected.
    expect(pickSlug(["A", "x", "../etc", "  ", "good-slug"])).toBe("good-slug");
  });

  it("returns null when nothing is valid", () => {
    expect(pickSlug([null, undefined, "", "no_underscores"])).toBeNull();
  });
});

describe("isSafeRelativePath (open-redirect guard)", () => {
  it("accepts same-origin absolute paths", () => {
    expect(isSafeRelativePath("/dashboard")).toBe(true);
    expect(isSafeRelativePath("/coffee/o/acme")).toBe(true);
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(isSafeRelativePath("//evil.com")).toBe(false);
    expect(isSafeRelativePath("/\\evil.com")).toBe(false);
    expect(isSafeRelativePath("https://evil.com")).toBe(false);
    expect(isSafeRelativePath("javascript:alert(1)")).toBe(false);
  });

  it("rejects empty / relative paths", () => {
    expect(isSafeRelativePath("")).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath("dashboard")).toBe(false);
  });
});

describe("storefrontHomePath", () => {
  it("builds the storefront path only for valid slugs", () => {
    expect(storefrontHomePath("acme-coffee")).toBe("/coffee/o/acme-coffee");
    expect(storefrontHomePath("../../etc/passwd")).toBeNull();
    expect(storefrontHomePath(null)).toBeNull();
  });
});

describe("readSfCtxSlug", () => {
  it("reads a valid slug from the vc_sf_ctx cookie", () => {
    expect(readSfCtxSlug(cookieStore({ [SF_CTX_COOKIE]: "acme-coffee" }))).toBe("acme-coffee");
  });

  it("ignores a malformed cookie value", () => {
    expect(readSfCtxSlug(cookieStore({ [SF_CTX_COOKIE]: "Not A Slug!" }))).toBeNull();
    expect(readSfCtxSlug(cookieStore({}))).toBeNull();
  });
});

describe("resolveAuthSlug precedence", () => {
  it("prefers the explicit ?storefront= param over everything", async () => {
    const slug = await resolveAuthSlug({
      paramSlug: "param-shop",
      cookies: cookieStore({ [SF_CTX_COOKIE]: "cookie-shop" }),
      userTenantSlug: "user-shop",
    });
    expect(slug).toBe("param-shop");
  });

  it("falls back to the vc_sf_ctx cookie when no param", async () => {
    const slug = await resolveAuthSlug({
      paramSlug: null,
      cookies: cookieStore({ [SF_CTX_COOKIE]: "cookie-shop" }),
      userTenantSlug: "user-shop",
    });
    expect(slug).toBe("cookie-shop");
  });

  it("falls back to the authenticated user's tenant last", async () => {
    const slug = await resolveAuthSlug({
      paramSlug: null,
      cookies: cookieStore({}),
      userTenantSlug: "user-shop",
    });
    expect(slug).toBe("user-shop");
  });

  it("returns null (generic branding) when no source resolves", async () => {
    const slug = await resolveAuthSlug({
      paramSlug: null,
      cookies: cookieStore({}),
      userTenantSlug: null,
    });
    expect(slug).toBeNull();
  });

  it("ignores a forged/invalid param and uses the next valid source", async () => {
    const slug = await resolveAuthSlug({
      paramSlug: "../secret-tenant",
      cookies: cookieStore({ [SF_CTX_COOKIE]: "cookie-shop" }),
      userTenantSlug: "user-shop",
    });
    expect(slug).toBe("cookie-shop");
  });
});
