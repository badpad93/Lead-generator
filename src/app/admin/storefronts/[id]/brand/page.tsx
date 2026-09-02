"use client";

/**
 * Admin-facing brand editor. Reuses the same BrandEditor component
 * the operator uses; only difference is the transport:
 *   GET   /api/admin/storefronts/tenants/{id}                      → { tenant }
 *   PATCH /api/admin/storefronts/tenants/{id} { patch: {...} }     → { tenant }
 *
 * Admin PATCH requires the payload wrapped in { patch: ... }
 * (see src/app/api/admin/storefronts/tenants/[id]/route.ts), while
 * the owner PATCH takes the fields at the top level. This page
 * bridges that difference in the saveBrand callback.
 *
 * Audit trail: the admin PATCH endpoint writes
 * "tenant.branding_updated" via storefront_audit_events when the
 * patch contains brand or public_page, so admin edits are captured
 * separately from owner edits.
 */
import { use } from "react";
import { createBrowserClient } from "@/lib/supabase";
import BrandEditor, {
  type Brand,
  type PublicPage,
  type Tenant,
} from "@/app/coffee/storefront/brand/BrandEditor";

async function authHeader(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export default function AdminBrandEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const backHref = `/admin/storefronts/${id}`;

  return (
    <BrandEditor
      backHref={backHref}
      backLabel="Tenant detail"
      editingContextNote="Editing on behalf of the tenant owner. Changes are audited as tenant.branding_updated with actor = you."
      loadTenant={async () => {
        const res = await fetch(`/api/admin/storefronts/tenants/${id}`, {
          headers: await authHeader(),
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { tenant: Tenant };
        return body.tenant;
      }}
      saveBrand={async (payload: { brand: Brand; public_page: PublicPage }) => {
        const res = await fetch(`/api/admin/storefronts/tenants/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(await authHeader()),
          },
          // Admin PATCH takes { patch: {...} }, not top-level fields.
          body: JSON.stringify({
            patch: { brand: payload.brand, public_page: payload.public_page },
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(b.error ?? `Save failed (${res.status})`);
        }
        const body = (await res.json()) as { tenant: Tenant };
        return body.tenant;
      }}
    />
  );
}
