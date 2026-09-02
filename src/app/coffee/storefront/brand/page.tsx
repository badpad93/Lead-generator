"use client";

/**
 * Operator-facing brand editor. Wires the shared BrandEditor to
 * the owner-scoped endpoints:
 *   GET   /api/storefront/tenant                → { tenant }
 *   PATCH /api/storefront/tenant  { brand, public_page } → { tenant }
 */
import { createBrowserClient } from "@/lib/supabase";
import BrandEditor, { type Brand, type PublicPage, type Tenant } from "./BrandEditor";

async function authHeader(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export default function OwnerBrandEditorPage() {
  return (
    <BrandEditor
      backHref="/coffee/storefront"
      backLabel="Storefront"
      loadTenant={async () => {
        const res = await fetch("/api/storefront/tenant", {
          headers: await authHeader(),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { tenant: Tenant };
        return body.tenant;
      }}
      saveBrand={async (payload: { brand: Brand; public_page: PublicPage }) => {
        const res = await fetch("/api/storefront/tenant", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeader()),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Save failed (${res.status})`);
        }
        const body = (await res.json()) as { tenant: Tenant };
        return body.tenant;
      }}
      uploadAsset={async (file, assetType) => {
        const form = new FormData();
        form.append("file", file);
        form.append("asset_type", assetType);
        // Owner uploads infer tenant from session; no tenant_id needed.
        const res = await fetch("/api/storefront/tenant/brand-asset", {
          method: "POST",
          headers: await authHeader(),
          body: form,
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Upload failed (${res.status})`);
        }
        const body = (await res.json()) as { url: string };
        return { url: body.url };
      }}
    />
  );
}
