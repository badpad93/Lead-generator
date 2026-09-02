"use client";

/**
 * Brand editor for the operator's storefront. Writes to
 * storefront_tenants.brand + public_page via PATCH /api/storefront/tenant
 * and shows a live preview mirroring how /coffee/o/[slug]/page.tsx
 * renders those fields — so what the operator sees here is what
 * a customer sees on the public page.
 *
 * Fields mirror the shape validated at the API layer:
 *   brand: {
 *     logo_url, favicon_url,
 *     primary_color, accent_color, text_color,
 *     hero_headline, hero_subheadline, footer_note
 *   }
 *   public_page: {
 *     enrollment_cta_label, show_contact,
 *     catalog_intro, allow_guest_browse
 *   }
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Brand {
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  text_color?: string | null;
  hero_headline?: string | null;
  hero_subheadline?: string | null;
  footer_note?: string | null;
}
interface PublicPage {
  enrollment_cta_label?: string | null;
  show_contact?: boolean;
  catalog_intro?: string | null;
  allow_guest_browse?: boolean;
}
interface Tenant {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string;
  status: string;
  brand: Brand;
  public_page: PublicPage;
  support_email: string | null;
}

const DEFAULTS = {
  primary_color: "#1a1a1a",
  accent_color: "#c4a877",
  text_color: "#f4f0e8",
};

export default function BrandEditorPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [brand, setBrand] = useState<Brand>({});
  const [publicPage, setPublicPage] = useState<PublicPage>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/storefront/tenant", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 404) {
        setTenant(null);
      } else if (res.ok) {
        const body = (await res.json()) as { tenant: Tenant };
        setTenant(body.tenant);
        setBrand(body.tenant.brand ?? {});
        setPublicPage(body.tenant.public_page ?? {});
      } else {
        throw new Error(await res.text());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/storefront/tenant", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ brand, public_page: publicPage }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? `Save failed (${res.status})`);
      }
      const body = (await res.json()) as { tenant: Tenant };
      setTenant(body.tenant);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8">Loading…</div>;

  if (!tenant) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Link href="/coffee/storefront" className="text-sm text-gray-500">
          ← Storefront
        </Link>
        <h1 className="text-2xl font-semibold mt-1">Brand & appearance</h1>
        <p className="mt-3 text-gray-700">
          Create a storefront first, then come back here to customize how it
          looks.
        </p>
        <Link
          href="/coffee/storefront"
          className="mt-4 inline-block rounded bg-black text-white px-4 py-2 text-sm"
        >
          Set up my storefront
        </Link>
      </div>
    );
  }

  const primary = brand.primary_color || DEFAULTS.primary_color;
  const accent = brand.accent_color || DEFAULTS.accent_color;
  const text = brand.text_color || DEFAULTS.text_color;

  return (
    <div className="max-w-6xl mx-auto p-8">
      <Link href="/coffee/storefront" className="text-sm text-gray-500">
        ← Storefront
      </Link>
      <div className="flex items-start justify-between mt-1">
        <div>
          <h1 className="text-2xl font-semibold">Brand & appearance</h1>
          <p className="text-sm text-gray-600 mt-1">
            Live preview shows how your public page at{" "}
            <code>/coffee/o/{tenant.slug}</code> will look.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedAt && Date.now() - savedAt < 4000 ? (
            <span className="text-sm text-green-700">Saved</span>
          ) : null}
          <Link
            href={`/coffee/o/${tenant.slug}`}
            target="_blank"
            className="text-sm text-blue-700 underline"
          >
            Open public page
          </Link>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-black text-white px-5 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error ? <div className="mt-3 text-red-700 text-sm">{error}</div> : null}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Editor column */}
        <div className="space-y-6">
          <Section title="Logo & favicon">
            <TextField
              label="Logo URL (PNG or SVG, ~200px tall)"
              value={brand.logo_url ?? ""}
              onChange={(v) => setBrand({ ...brand, logo_url: v || null })}
              placeholder="https://…/logo.png"
            />
            <TextField
              label="Favicon URL (ICO/PNG, 32×32)"
              value={brand.favicon_url ?? ""}
              onChange={(v) => setBrand({ ...brand, favicon_url: v || null })}
              placeholder="https://…/favicon.png"
            />
            <p className="text-xs text-gray-500">
              Host these on your own site or CDN. Vending Connector doesn't yet
              provide an upload endpoint.
            </p>
          </Section>

          <Section title="Colors">
            <div className="grid grid-cols-3 gap-3">
              <ColorField
                label="Primary"
                value={primary}
                onChange={(v) => setBrand({ ...brand, primary_color: v })}
              />
              <ColorField
                label="Accent"
                value={accent}
                onChange={(v) => setBrand({ ...brand, accent_color: v })}
              />
              <ColorField
                label="Text on primary"
                value={text}
                onChange={(v) => setBrand({ ...brand, text_color: v })}
              />
            </div>
            <p className="text-xs text-gray-500">
              Primary fills the header + footer. Accent is the CTA / logo tint.
              Text-on-primary is the header text color; make sure it's readable
              against your primary.
            </p>
          </Section>

          <Section title="Hero copy">
            <TextField
              label="Hero headline"
              value={brand.hero_headline ?? ""}
              onChange={(v) => setBrand({ ...brand, hero_headline: v || null })}
              placeholder={`Coffee from ${tenant.display_name}`}
            />
            <TextAreaField
              label="Hero subheadline"
              value={brand.hero_subheadline ?? ""}
              onChange={(v) => setBrand({ ...brand, hero_subheadline: v || null })}
              placeholder="One sentence about the program or your promise to customers"
              rows={2}
            />
          </Section>

          <Section title="Catalog intro (optional)">
            <TextAreaField
              label="Text above the product grid"
              value={publicPage.catalog_intro ?? ""}
              onChange={(v) => setPublicPage({ ...publicPage, catalog_intro: v || null })}
              placeholder="Short paragraph — shipping cadence, minimum order, contact for special orders."
              rows={3}
            />
          </Section>

          <Section title="Footer">
            <TextField
              label="Footer note"
              value={brand.footer_note ?? ""}
              onChange={(v) => setBrand({ ...brand, footer_note: v || null })}
              placeholder="Small print — hours, phone, tagline"
            />
            <label className="flex items-center gap-2 text-sm mt-2">
              <input
                type="checkbox"
                checked={publicPage.show_contact === true}
                onChange={(e) =>
                  setPublicPage({ ...publicPage, show_contact: e.target.checked })
                }
              />
              Show a Contact link in the header (uses support email:{" "}
              <strong>{tenant.support_email || "not set"}</strong>)
            </label>
          </Section>
        </div>

        {/* Preview column — mirrors /coffee/o/[slug]/page.tsx layout */}
        <div className="lg:sticky lg:top-8 self-start">
          <div className="text-xs uppercase text-gray-500 mb-2">Preview</div>
          <div className="rounded-lg overflow-hidden border border-gray-300 shadow-sm">
            <div
              className="w-full px-6 py-8"
              style={{ background: primary, color: text }}
            >
              <div className="flex items-center gap-3">
                {brand.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brand.logo_url}
                    alt=""
                    className="h-10 w-auto"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded-full"
                    style={{ background: accent }}
                  />
                )}
                <div>
                  <div className="text-lg font-semibold">{tenant.display_name}</div>
                  <div className="text-[10px] opacity-70">
                    Powered by Vending Connector
                  </div>
                </div>
              </div>
              <div className="mt-6">
                <h1
                  className="text-2xl md:text-3xl font-semibold"
                  style={{ color: accent }}
                >
                  {brand.hero_headline || `Coffee from ${tenant.display_name}`}
                </h1>
                {brand.hero_subheadline ? (
                  <p className="mt-2 text-sm opacity-90 max-w-md">
                    {brand.hero_subheadline}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="p-6 bg-[#f6f4ef] min-h-[160px]">
              {publicPage.catalog_intro ? (
                <p className="text-xs text-gray-700 mb-4">
                  {publicPage.catalog_intro}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="rounded border border-gray-200 bg-white p-3 text-xs"
                  >
                    <div className="h-20 bg-gray-100 rounded mb-2" />
                    <div className="font-medium">Product {i + 1}</div>
                    <div className="text-gray-500 text-[10px]">SKU-{i + 1}</div>
                  </div>
                ))}
              </div>
            </div>
            <div
              className="px-6 py-4 text-[11px]"
              style={{ background: primary, color: text, opacity: 0.9 }}
            >
              © {new Date().getFullYear()} {tenant.legal_name}. All rights reserved.
              {brand.footer_note ? (
                <div className="opacity-80 mt-1">{brand.footer_note}</div>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Preview updates as you type. Click Save to publish. Changes are live
            on <code>/coffee/o/{tenant.slug}</code> immediately after save.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="font-medium mb-3">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border rounded px-3 py-2 text-sm"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows ?? 3}
        className="mt-1 w-full border rounded px-3 py-2 text-sm"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-gray-600">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-14 rounded border border-gray-300 cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 border rounded px-2 py-1 text-xs font-mono"
        />
      </div>
    </label>
  );
}
