import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyLoginBranding,
  isCustomLoginBranding,
  type LoginBrandFields,
} from "./loginBranding";

/*
 * Login-page branding overlay — additive. Default/inherit must leave the
 * storefront-derived brand byte-for-byte unchanged; custom overlays only the
 * fields that are set.
 */

const base: LoginBrandFields & { slug: string } = {
  slug: "twelve28",
  display_name: "Twelve28 Vend",
  logo_url: "https://cdn/store-logo.png",
  primary_color: "#1a1a1a",
  accent_color: "#c4a877",
};

describe("isCustomLoginBranding", () => {
  it("only true for explicit custom mode", () => {
    expect(isCustomLoginBranding(undefined)).toBe(false);
    expect(isCustomLoginBranding(null)).toBe(false);
    expect(isCustomLoginBranding({})).toBe(false);
    expect(isCustomLoginBranding({ mode: "inherit" })).toBe(false);
    expect(isCustomLoginBranding({ mode: "custom" })).toBe(true);
  });
});

describe("applyLoginBranding — default path is unchanged", () => {
  it("returns the base untouched when login is absent", () => {
    expect(applyLoginBranding(base, undefined)).toEqual(base);
    expect(applyLoginBranding(base, null)).toEqual(base);
  });
  it("returns the base untouched for inherit mode", () => {
    expect(applyLoginBranding(base, { mode: "inherit" })).toEqual(base);
  });
  it("returns the base untouched for custom mode with no fields set", () => {
    expect(applyLoginBranding(base, { mode: "custom" })).toEqual(base);
  });
  it("ignores blank/whitespace custom values (falls back to base)", () => {
    const out = applyLoginBranding(base, {
      mode: "custom",
      display_name: "   ",
      logo_url: "",
      primary_color: null,
    });
    expect(out).toEqual(base);
  });
});

describe("applyLoginBranding — custom overlays only set fields", () => {
  it("full override replaces every field but preserves extras (slug)", () => {
    const out = applyLoginBranding(base, {
      mode: "custom",
      display_name: "Members Login",
      logo_url: "https://cdn/login-logo.png",
      primary_color: "#003366",
      accent_color: "#ffcc00",
    });
    expect(out).toEqual({
      slug: "twelve28",
      display_name: "Members Login",
      logo_url: "https://cdn/login-logo.png",
      primary_color: "#003366",
      accent_color: "#ffcc00",
    });
  });
  it("partial override keeps base for the unset fields", () => {
    const out = applyLoginBranding(base, { mode: "custom", primary_color: "#003366" });
    expect(out.primary_color).toBe("#003366");
    expect(out.display_name).toBe(base.display_name);
    expect(out.logo_url).toBe(base.logo_url);
    expect(out.accent_color).toBe(base.accent_color);
  });
  it("trims custom string values", () => {
    const out = applyLoginBranding(base, { mode: "custom", display_name: "  Login  " });
    expect(out.display_name).toBe("Login");
  });
  it("a custom logo can be a different image from the storefront logo", () => {
    const out = applyLoginBranding(base, { mode: "custom", logo_url: "https://cdn/other.png" });
    expect(out.logo_url).toBe("https://cdn/other.png");
    expect(out.logo_url).not.toBe(base.logo_url);
  });
});

/* ---- wiring guards ---- */

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(ROOT + rel, "utf8");

describe("wiring", () => {
  it("the server auth-brand resolver applies the overlay after building the base", () => {
    const src = read("src/lib/storefrontAuthContext.ts");
    expect(src).toContain("applyLoginBranding");
    const baseIdx = src.indexOf("const base: AuthBrand");
    const applyIdx = src.indexOf("return applyLoginBranding(base, brand.login)");
    expect(baseIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeGreaterThan(baseIdx);
  });
  it("the shared brand editor renders the Login page section with an inherit/custom toggle", () => {
    const src = read("src/app/coffee/storefront/brand/BrandEditor.tsx");
    expect(src).toContain('title="Login page"');
    expect(src).toContain('login: { ...brand.login, mode: "inherit" }');
    expect(src).toContain('login: { ...brand.login, mode: "custom" }');
    expect(src).toContain("Login preview");
  });
  it("TenantBrand carries the optional login override (persisted in brand jsonb)", () => {
    expect(read("src/lib/storefront/tenants.ts")).toContain("login?: LoginBranding | null");
  });
});
