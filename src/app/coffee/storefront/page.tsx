"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

interface Tenant {
  id: string;
  slug: string;
  status: string;
  display_name: string;
  legal_name: string;
  brand: Record<string, unknown>;
  public_page: Record<string, unknown>;
  base_pricing_tier_id: string | null;
  tax_status: string;
  approved_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
}

export default function StorefrontDashboardPage() {
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login?next=/coffee/storefront");
          return;
        }
        const res = await fetch("/api/storefront/tenant", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.status === 404) {
          setTenant(null);
        } else if (!res.ok) {
          throw new Error(await res.text());
        } else {
          const data = (await res.json()) as { tenant: Tenant };
          setTenant(data.tenant);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  if (loading) return <div className="p-10">Loading…</div>;
  if (error) return <div className="p-10 text-red-700">{error}</div>;

  if (!tenant) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <h1 className="text-2xl font-semibold">My storefront</h1>
        <p className="mt-3 text-gray-700">
          You don't have a coffee storefront yet. Create one to get a public
          branded page at <code>/coffee/o/&#123;slug&#125;</code>. If you've
          signed the coffee agreement, your storefront goes live immediately —
          no admin approval needed.
        </p>
        <CreateTenantForm onCreated={setTenant} />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{tenant.display_name}</h1>
          <div className="text-sm text-gray-600 mt-1">
            /coffee/o/{tenant.slug} ·{" "}
            <span
              className={
                tenant.status === "approved"
                  ? "text-green-700"
                  : tenant.status === "suspended"
                    ? "text-red-700"
                    : "text-amber-700"
              }
            >
              {tenant.status}
            </span>
          </div>
          {tenant.suspended_at && tenant.suspended_reason ? (
            <div className="mt-2 text-sm text-red-700">
              Suspended: {tenant.suspended_reason}
            </div>
          ) : null}
        </div>
        {tenant.status === "approved" ? (
          <Link
            href={`/coffee/o/${tenant.slug}`}
            className="rounded-md bg-black text-white px-4 py-2 text-sm"
            target="_blank"
          >
            View public page
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        <DashCard href="/coffee/storefront/brand" title="Brand & appearance">
          Logo, colors, hero copy — what customers see at /coffee/o/{tenant.slug}.
        </DashCard>
        <DashCard href="/coffee/storefront/pricing" title="Pricing">
          Set your customer-facing prices and per-customer overrides.
        </DashCard>
        <DashCard href="/coffee/storefront/customers" title="Customers">
          Manage the accounts enrolled with your storefront.
        </DashCard>
        <DashCard href="/coffee/storefront/invitations" title="Invitations">
          Invite new customers with a one-shot enrollment link.
        </DashCard>
      </div>

      <div className="mt-8 rounded-md border border-gray-200 p-4">
        <div className="font-medium">Tax onboarding</div>
        <div className="text-sm text-gray-600 mt-1">
          Payouts require a W-9 on file with Vending Connector.
          Current status: <strong>{tenant.tax_status}</strong>. Contact
          support@apexaivending.com to update.
        </div>
      </div>
    </div>
  );
}

function DashCard({
  href,
  title,
  children,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-gray-200 p-4 hover:bg-gray-50"
    >
      <div className="font-medium">{title}</div>
      <div className="mt-1 text-sm text-gray-600">{children}</div>
    </Link>
  );
}

function CreateTenantForm({
  onCreated,
}: {
  onCreated: (t: Tenant) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [slug, setSlug] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/storefront/tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          slug,
          legal_name: legalName,
          display_name: displayName,
          primary_contact_email: contactEmail,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Create failed");
      }
      const data = (await res.json()) as { tenant: Tenant };
      onCreated(data.tenant);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 border-t pt-6">
      <div>
        <label className="text-sm font-medium">Display name</label>
        <input
          className="mt-1 w-full border rounded px-3 py-2 text-sm"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Acme Coffee"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">Legal business name</label>
        <input
          className="mt-1 w-full border rounded px-3 py-2 text-sm"
          value={legalName}
          onChange={(e) => setLegalName(e.target.value)}
          placeholder="Acme Beverage Services LLC"
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">URL slug</label>
        <input
          className="mt-1 w-full border rounded px-3 py-2 text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="acme"
          pattern="[a-z0-9][a-z0-9\-]{1,60}[a-z0-9]"
          required
        />
        <div className="text-xs text-gray-500 mt-1">
          Lowercase letters, digits, hyphens. Your page will be
          /coffee/o/{slug || "…"}.
        </div>
      </div>
      <div>
        <label className="text-sm font-medium">Contact email</label>
        <input
          type="email"
          className="mt-1 w-full border rounded px-3 py-2 text-sm"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
        />
      </div>
      {error ? <div className="text-sm text-red-700">{error}</div> : null}
      <button
        type="submit"
        disabled={creating}
        className="rounded-md bg-black text-white px-5 py-2 text-sm disabled:opacity-60"
      >
        {creating ? "Creating…" : "Create storefront"}
      </button>
    </form>
  );
}
