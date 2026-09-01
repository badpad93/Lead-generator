"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Tenant {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string;
  status: string;
  approved_at: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  base_pricing_tier_id: string | null;
  tax_status: string;
  qb_vendor_ref: string | null;
  qb_customer_ref: string | null;
}

export default function AdminStorefrontDetailPage() {
  const params = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tiers, setTiers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const [tenantRes, tierRes] = await Promise.all([
      fetch(`/api/admin/storefronts/tenants/${params.id}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      }),
      fetch("/api/coffee/pricing-tiers"),
    ]);
    if (tenantRes.ok) {
      const body = (await tenantRes.json()) as { tenant: Tenant };
      setTenant(body.tenant);
    }
    if (tierRes.ok) {
      const body = (await tierRes.json()) as
        | { tiers?: Array<{ id: string; name: string }> }
        | Array<{ id: string; name: string }>;
      const arr = Array.isArray(body) ? body : (body.tiers ?? []);
      setTiers(arr);
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/storefronts/tenants/${params.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Action failed");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="p-8">Loading…</div>;
  if (!tenant) return <div className="p-8 text-red-700">Not found</div>;

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-6">
      <Link href="/admin/storefronts" className="text-sm text-gray-500">
        ← Storefronts
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{tenant.display_name}</h1>
        <div className="text-sm text-gray-600">{tenant.legal_name}</div>
        <div className="text-sm mt-1">
          Slug: <code>{tenant.slug}</code> · Status:{" "}
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
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-red-700 text-sm">
          {error}
        </div>
      ) : null}

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Lifecycle</div>
        <div className="mt-3 flex gap-2">
          <button
            disabled={busy || tenant.status === "approved"}
            onClick={() => action({ action: "approve", reason })}
            className="rounded bg-green-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Approve
          </button>
          <button
            disabled={busy || tenant.status === "closed"}
            onClick={() => {
              if (!reason.trim()) {
                setError("Reason is required to suspend");
                return;
              }
              void action({ action: "suspend", reason });
            }}
            className="rounded bg-amber-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Suspend
          </button>
          <button
            disabled={busy || tenant.status === "closed"}
            onClick={() => action({ action: "close", reason })}
            className="rounded bg-red-600 text-white px-3 py-1 text-sm disabled:opacity-50"
          >
            Close
          </button>
        </div>
        <input
          className="mt-2 w-full border rounded px-3 py-1 text-sm"
          placeholder="Reason (mandatory for suspend)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </section>

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Pricing tier</div>
        <div className="mt-3 flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={tenant.base_pricing_tier_id ?? ""}
            onChange={(e) =>
              action({
                action: "assign_tier",
                base_pricing_tier_id: e.target.value || null,
              })
            }
          >
            <option value="">— unassigned —</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="rounded border border-gray-200 p-4">
        <div className="font-medium">Tax onboarding</div>
        <div className="mt-3 flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={tenant.tax_status}
            onChange={(e) =>
              action({ patch: { tax_status: e.target.value } })
            }
          >
            <option value="not_started">Not started</option>
            <option value="submitted">W-9 submitted</option>
            <option value="approved">W-9 approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </section>
    </div>
  );
}
