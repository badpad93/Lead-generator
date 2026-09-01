"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface TenantRow {
  id: string;
  slug: string;
  display_name: string;
  legal_name: string;
  status: string;
  base_pricing_tier_id: string | null;
  tax_status: string;
  created_at: string;
  owner?: { id: string; full_name: string; email: string } | null;
}

export default function AdminStorefrontsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/admin/storefronts/tenants${qs}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { tenants: TenantRow[] };
      setTenants(body.tenants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-6xl mx-auto p-8">
      <h1 className="text-2xl font-semibold">Storefronts</h1>
      <div className="mt-3 flex items-center gap-2 text-sm">
        <label>Status:</label>
        <select
          className="border rounded px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="suspended">Suspended</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      {error ? <div className="mt-3 text-red-700">{error}</div> : null}
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">Storefront</th>
            <th className="py-2">Owner</th>
            <th className="py-2">Slug</th>
            <th className="py-2">Status</th>
            <th className="py-2">Tax</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} className="py-4 text-gray-500">
                Loading…
              </td>
            </tr>
          ) : tenants.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-gray-500">
                No tenants.
              </td>
            </tr>
          ) : (
            tenants.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="py-2">
                  <Link
                    href={`/admin/storefronts/${t.id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {t.display_name}
                  </Link>
                  <div className="text-xs text-gray-500">{t.legal_name}</div>
                </td>
                <td className="py-2">
                  {t.owner?.full_name ?? "—"}
                  <div className="text-xs text-gray-500">{t.owner?.email}</div>
                </td>
                <td className="py-2">
                  <code>{t.slug}</code>
                </td>
                <td className="py-2">
                  <span
                    className={
                      t.status === "approved"
                        ? "text-green-700"
                        : t.status === "suspended"
                          ? "text-red-700"
                          : "text-amber-700"
                    }
                  >
                    {t.status}
                  </span>
                </td>
                <td className="py-2">{t.tax_status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
