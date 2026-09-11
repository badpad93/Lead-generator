/**
 * Optional per-storefront LOGIN-page branding overrides.
 *
 * The storefront's login page is branded with the operator's storefront
 * brand by default (logo / name / colors) — that behavior is unchanged and
 * is what ships today. This module is a pure, additive overlay: a storefront
 * may OPT IN to a distinct set of login-page branding instead.
 *
 *   mode "inherit" (or absent)  → use the storefront brand as-is (default)
 *   mode "custom"               → overlay whichever login fields are set;
 *                                 any blank field still falls back to the
 *                                 storefront brand, so a partial override is
 *                                 safe.
 *
 * Stored under brand.login (the brand column is jsonb, so no migration).
 * Pure + env-free so the overlay rule is unit-tested directly, and so it can
 * be shared by the server auth-brand resolver and the brand editor preview
 * without pulling either into the other.
 */

export type LoginBrandingMode = "inherit" | "custom";

export interface LoginBranding {
  mode?: LoginBrandingMode | null;
  display_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
}

/** The brand fields the login page actually renders. */
export interface LoginBrandFields {
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

/** Trimmed non-empty string, else null. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Is the custom login branding actively selected? */
export function isCustomLoginBranding(login: LoginBranding | null | undefined): boolean {
  return !!login && login.mode === "custom";
}

/**
 * Overlay login-specific branding onto the storefront-derived base.
 * Returns the base UNCHANGED unless custom mode is selected; in custom mode
 * each set field replaces the base, and each blank field keeps the base — so
 * "custom" can be a full or a partial override. Extra base fields (e.g. the
 * AuthBrand `slug`) are preserved via spread.
 */
export function applyLoginBranding<T extends LoginBrandFields>(
  base: T,
  login: LoginBranding | null | undefined,
): T {
  if (!isCustomLoginBranding(login)) return base;
  const l = login as LoginBranding;
  return {
    ...base,
    display_name: str(l.display_name) ?? base.display_name,
    logo_url: str(l.logo_url) ?? base.logo_url,
    primary_color: str(l.primary_color) ?? base.primary_color,
    accent_color: str(l.accent_color) ?? base.accent_color,
  };
}
