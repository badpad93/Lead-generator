"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface PriceRow {
  id: string;
  product_id: string;
  customer_price: number;
  active: boolean;
  updated_at: string;
}
interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  active: boolean;
}

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [dirty, setDirty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const [priceRes, productRes] = await Promise.all([
      fetch("/api/storefront/tenant/prices", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      }),
      fetch("/api/coffee/products?active=1"),
    ]);
    if (priceRes.ok) {
      const body = (await priceRes.json()) as { prices: PriceRow[] };
      setPrices(body.prices);
    }
    if (productRes.ok) {
      const body = (await productRes.json()) as { products?: Product[] } | Product[];
      const arr = Array.isArray(body) ? body : (body.products ?? []);
      setProducts(arr);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const priceByProduct = useMemo(() => {
    const m = new Map<string, PriceRow>();
    for (const p of prices) m.set(p.product_id, p);
    return m;
  }, [prices]);

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
      const res = await fetch("/api/storefront/tenant/prices", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ entries }),
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

  if (loading) return <div className="p-8">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/coffee/storefront" className="text-sm text-gray-500">
            ← Storefront
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Customer prices</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Set the price your customers see for every product. Vending
            Connector's base price is your cost — the difference is your
            commission at checkout. Prices below the base are blocked at
            checkout.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || Object.keys(dirty).length === 0}
          className="rounded-md bg-black text-white px-5 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : `Save (${Object.keys(dirty).length})`}
        </button>
      </div>
      {error ? <div className="mt-4 text-red-700 text-sm">{error}</div> : null}
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">SKU</th>
            <th className="py-2">Product</th>
            <th className="py-2 text-right">Base</th>
            <th className="py-2 text-right">Your price</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const current = priceByProduct.get(p.id);
            const value =
              dirty[p.id] !== undefined
                ? dirty[p.id]
                : current
                  ? Number(current.customer_price)
                  : Number(p.price);
            return (
              <tr key={p.id} className="border-t">
                <td className="py-2">{p.sku}</td>
                <td className="py-2">{p.name}</td>
                <td className="py-2 text-right text-gray-500">
                  ${Number(p.price).toFixed(2)}
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={value}
                    className="w-28 text-right border rounded px-2 py-1"
                    onChange={(e) =>
                      setDirty((d) => ({ ...d, [p.id]: Number(e.target.value) }))
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
