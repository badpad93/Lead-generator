import type { AuthBrand } from "@/lib/storefrontAuthContext";

/**
 * Server-rendered storefront brand header for auth screens.
 *
 * Renders a color-immersive band using the operator's SAME brand
 * object the storefront (/coffee/o/[slug]) uses — primary color as
 * the band background, accent for the name, plus the logo — so the
 * invite/signup/login/verification/reset journey looks like the same
 * business, not a generic Vending Connector page. "Powered by Vending
 * Connector" stays as subtle secondary branding. Given null it renders
 * nothing, so the host page falls back to generic chrome.
 *
 * Server-rendered so the brand is present on first paint — no client
 * fetch flash, no lost context after a redirect.
 */
export default function AuthBrandHeader({ brand }: { brand: AuthBrand | null }) {
  if (!brand) return null;
  const primary = brand.primary_color || "#1a1a1a";
  const accent = brand.accent_color || "#c4a877";
  return (
    <div
      className="mb-6 rounded-2xl px-6 py-6 text-center shadow-sm"
      style={{ background: primary }}
    >
      {brand.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo_url}
          alt={`${brand.display_name} logo`}
          className="mx-auto mb-3 h-12 w-auto"
        />
      ) : null}
      <div className="text-xl font-semibold" style={{ color: accent }}>
        {brand.display_name}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide" style={{ color: accent, opacity: 0.7 }}>
        Powered by Vending Connector
      </div>
    </div>
  );
}
