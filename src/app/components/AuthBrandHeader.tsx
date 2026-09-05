import type { AuthBrand } from "@/lib/storefrontAuthContext";

/**
 * Server-rendered storefront brand header for auth screens.
 *
 * Given a resolved operator brand it renders the operator's logo /
 * name (with a "Powered by Vending Connector" byline); given null it
 * renders nothing, so the host page falls back to its generic
 * Vending Connector header. Rendered on the server so an invited
 * customer sees their operator's identity on first paint — no client
 * fetch flash, no lost context after a redirect.
 */
export default function AuthBrandHeader({ brand }: { brand: AuthBrand | null }) {
  if (!brand) return null;
  return (
    <div className="text-center mb-6">
      {brand.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logo_url}
          alt={`${brand.display_name} logo`}
          className="mx-auto mb-3 h-12 w-auto"
        />
      ) : null}
      <div className="text-lg font-semibold text-black-primary">{brand.display_name}</div>
      <div className="text-xs text-black-primary/40">Powered by Vending Connector</div>
    </div>
  );
}
