"use client";

/**
 * Client hook: resolve a storefront tenant's public brand by slug.
 *
 * Powers the storefront-branded auth journey (signup → check-email
 * → verification → login) so an invited tenant sees their
 * operator's identity end to end instead of Vending Connector's.
 * Backed by /api/storefront/public/[slug], which only exposes
 * approved tenants' safe fields. Null while loading, on a missing
 * slug, or on any failure — callers fall back to generic branding.
 */

import { useEffect, useState } from "react";

export interface StorefrontBrand {
  slug: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
}

export function useStorefrontBrand(slug: string | null | undefined): StorefrontBrand | null {
  const [brand, setBrand] = useState<StorefrontBrand | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/storefront/public/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: {
          tenant?: { slug: string; display_name: string; brand?: Record<string, unknown> };
        } | null) => {
          if (cancelled || !data?.tenant) return;
          const b = data.tenant.brand ?? {};
          setBrand({
            slug: data.tenant.slug,
            display_name: data.tenant.display_name,
            logo_url: (b.logo_url as string) || null,
            primary_color: (b.primary_color as string) || "#1a1a1a",
            accent_color: (b.accent_color as string) || "#c4a877",
          });
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return brand;
}
