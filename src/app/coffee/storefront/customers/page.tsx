"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Customer {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  storefront_enrolled_at: string | null;
  storefront_enrollment_source: string | null;
  orderCount: number;
  lifetimeSpend: number;
  lifetimeCommission: number;
  lastOrderAt: string | null;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  // Pricing-tier assignment (migration 185). Absent = Tier 1.
  const [tierAssignments, setTierAssignments] = useState<Record<string, number>>({});
  const [tierNames, setTierNames] = useState<Record<string, string>>({ "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" });
  const [savingTier, setSavingTier] = useState<string | null>(null);

  async function handleTierChange(customerId: string, tier: number) {
    setSavingTier(customerId);
    setError(null);
    const prev = tierAssignments[customerId] ?? 1;
    setTierAssignments((a) => ({ ...a, [customerId]: tier }));
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/storefront/tenant/customer-tiers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ entries: [{ customer_profile_id: customerId, tier }] }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      setTierAssignments((a) => ({ ...a, [customerId]: prev })); // revert
      setError(e instanceof Error ? e.message : "Could not update tier");
    } finally {
      setSavingTier(null);
    }
  }

  // Delete a customer entirely. Customer-only accounts are removed
  // outright (login killed); accounts with other platform roles are
  // just unlinked from the storefront — the server decides.
  async function handleDelete(c: Customer) {
    if (
      !confirm(
        `Delete ${c.full_name || c.email} from your storefront?\n\nThis removes their access permanently. If their account exists only for your storefront, the account is deleted entirely.`,
      )
    )
      return;
    setDeleting(c.id);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/storefront/tenant/customers?profile_id=${encodeURIComponent(c.id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || "Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const auth = { Authorization: `Bearer ${session?.access_token ?? ""}` };
      const [res, tierRes, priceRes] = await Promise.all([
        fetch("/api/storefront/tenant/customers", { headers: auth }),
        fetch("/api/storefront/tenant/customer-tiers", { headers: auth }),
        fetch("/api/storefront/tenant/tier-prices", { headers: auth }),
      ]);
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as { customers: Customer[] };
      setCustomers(body.customers);
      if (tierRes.ok) {
        const tb = (await tierRes.json()) as { assignments?: Record<string, number> };
        setTierAssignments(tb.assignments ?? {});
      }
      if (priceRes.ok) {
        const pb = (await priceRes.json()) as { tier_names?: Record<string, string> };
        if (pb.tier_names) setTierNames(pb.tier_names);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto p-8">
      <Link href="/coffee/storefront" className="text-sm text-gray-500">
        ← Storefront
      </Link>
      <h1 className="text-2xl font-semibold mt-1">Customers</h1>
      <p className="text-sm text-gray-600 mt-1">
        Every account permanently enrolled with your storefront. To transfer a
        customer to another tenant, contact Vending Connector — it's an
        admin-only action.
      </p>
      {error ? <div className="mt-3 text-red-700 text-sm">{error}</div> : null}

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">Customer</th>
            <th className="py-2">Location</th>
            <th className="py-2">Pricing tier</th>
            <th className="py-2 text-right">Orders</th>
            <th className="py-2 text-right">Lifetime spend</th>
            <th className="py-2 text-right">Your commission</th>
            <th className="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} className="py-4 text-gray-500">
                Loading…
              </td>
            </tr>
          ) : customers.length === 0 ? (
            <tr>
              <td colSpan={7} className="py-4 text-gray-500">
                No customers yet.{" "}
                <Link
                  href="/coffee/storefront/invitations"
                  className="text-blue-700 underline"
                >
                  Send an invite
                </Link>
                .
              </td>
            </tr>
          ) : (
            customers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="py-2">
                  <div className="font-medium">{c.full_name || c.email}</div>
                  <div className="text-xs text-gray-500">{c.email}</div>
                </td>
                <td className="py-2 text-gray-600">
                  {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="py-2">
                  <select
                    value={tierAssignments[c.id] ?? 1}
                    disabled={savingTier === c.id}
                    onChange={(e) => handleTierChange(c.id, Number(e.target.value))}
                    className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {[1, 2, 3].map((t) => (
                      <option key={t} value={t}>{tierNames[String(t)] ?? `Tier ${t}`}</option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-right">{c.orderCount}</td>
                <td className="py-2 text-right">${c.lifetimeSpend.toFixed(2)}</td>
                <td className="py-2 text-right">${c.lifetimeCommission.toFixed(2)}</td>
                <td className="py-2 text-right">
                  <span className="inline-flex items-center gap-3">
                    <button
                      onClick={() => setSelected(c)}
                      className="text-xs text-blue-700 hover:underline cursor-pointer"
                    >
                      View & price
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deleting === c.id}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50 cursor-pointer"
                    >
                      {deleting === c.id ? "Deleting…" : "Delete"}
                    </button>
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {selected ? (
        <CustomerDrawer customer={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  );
}

interface CustomerPriceRow {
  id: string;
  product_id: string;
  customer_price: number;
  source: string;
}
interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
}

function CustomerDrawer({
  customer,
  onClose,
}: {
  customer: Customer;
  onClose: () => void;
}) {
  const [prices, setPrices] = useState<CustomerPriceRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dirty, setDirty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const [priceRes, productRes] = await Promise.all([
        fetch(`/api/storefront/tenant/customer-prices?customer_id=${customer.id}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        }),
        fetch("/api/coffee/products?active=1"),
      ]);
      if (priceRes.ok) {
        const b = (await priceRes.json()) as { prices: CustomerPriceRow[] };
        setPrices(b.prices);
      }
      if (productRes.ok) {
        const b = (await productRes.json()) as { products?: Product[] } | Product[];
        setProducts(Array.isArray(b) ? b : (b.products ?? []));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const entries = Object.entries(dirty)
        .filter(([, v]) => Number.isFinite(v) && v >= 0)
        .map(([product_id, customer_price]) => ({ product_id, customer_price }));
      if (entries.length === 0) return;
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/storefront/tenant/customer-prices", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({
          customer_profile_id: customer.id,
          entries,
          source: "manual",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setDirty({});
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const priceByProduct = new Map(prices.map((p) => [p.product_id, p]));

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <div className="font-semibold">{customer.full_name || customer.email}</div>
            <div className="text-xs text-gray-500">{customer.email}</div>
          </div>
          <button onClick={onClose} className="text-sm text-gray-500">
            Close
          </button>
        </div>
        <div className="p-4">
          <div className="text-sm text-gray-600">
            Enrolled{" "}
            {customer.storefront_enrolled_at
              ? new Date(customer.storefront_enrolled_at).toLocaleDateString()
              : "—"}{" "}
            via {customer.storefront_enrollment_source ?? "—"}
          </div>
          <div className="mt-4 text-sm font-medium">Per-customer prices</div>
          <div className="text-xs text-gray-500">
            Overrides your tenant defaults for this customer only. Leaving blank
            = customer inherits the tenant price.
          </div>
          {error ? <div className="mt-3 text-red-700 text-sm">{error}</div> : null}
          {loading ? (
            <div className="mt-4 text-sm text-gray-500">Loading…</div>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="py-2">Product</th>
                  <th className="py-2 text-right">Base</th>
                  <th className="py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const cur = priceByProduct.get(p.id);
                  const value =
                    dirty[p.id] !== undefined
                      ? dirty[p.id]
                      : cur
                        ? Number(cur.customer_price)
                        : "";
                  return (
                    <tr key={p.id} className="border-t">
                      <td className="py-2">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.sku}</div>
                      </td>
                      <td className="py-2 text-right text-gray-500">
                        ${Number(p.price).toFixed(2)}
                      </td>
                      <td className="py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={value}
                          onChange={(e) =>
                            setDirty((d) => ({
                              ...d,
                              [p.id]: Number(e.target.value),
                            }))
                          }
                          className="w-24 text-right border rounded px-2 py-1"
                          placeholder={cur ? undefined : "inherit"}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <button
            onClick={save}
            disabled={saving || Object.keys(dirty).length === 0}
            className="mt-4 rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
          >
            {saving ? "Saving…" : `Save (${Object.keys(dirty).length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
