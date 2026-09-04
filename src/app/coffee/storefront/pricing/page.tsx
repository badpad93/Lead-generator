"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Owner pricing + catalog visibility for one storefront.
 *
 *   - "Your price" writes storefront_tenant_prices — the tenant-wide
 *     customer price the checkout resolver applies (precedence:
 *     proposal → per-customer override → THIS → list price → tier).
 *   - "Base" is the owner's true cost: their assigned tier price,
 *     falling back to list. Margin = your price − base. Prices below
 *     base are flagged here and refused at checkout.
 *   - "Visible" toggles storefront_tenant_hidden_products — a hidden
 *     product disappears from this storefront's page, price list,
 *     quote and checkout. Other storefronts and the main marketplace
 *     are unaffected.
 */

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

function marginClass(belowBase: boolean, margin: number): string {
  if (belowBase) return "text-red-600";
  if (margin > 0) return "text-green-700";
  return "text-gray-500";
}

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [basePrices, setBasePrices] = useState<Record<string, number>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Record<string, number>>({});
  const [dirtyVisibility, setDirtyVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const auth = { Authorization: `Bearer ${session?.access_token ?? ""}` };
    const [priceRes, productRes, visRes] = await Promise.all([
      fetch("/api/storefront/tenant/prices", { headers: auth }),
      fetch("/api/coffee/products?active=1"),
      fetch("/api/storefront/tenant/visibility", { headers: auth }),
    ]);
    if (priceRes.ok) {
      const body = (await priceRes.json()) as {
        prices: PriceRow[];
        base_prices?: Record<string, number>;
      };
      setPrices(body.prices);
      setBasePrices(body.base_prices ?? {});
    }
    if (productRes.ok) {
      const body = (await productRes.json()) as { products?: Product[] } | Product[];
      const arr = Array.isArray(body) ? body : (body.products ?? []);
      setProducts(arr);
    }
    if (visRes.ok) {
      const body = (await visRes.json()) as { hidden?: string[] };
      setHidden(new Set(body.hidden ?? []));
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

  const dirtyCount = Object.keys(dirty).length + Object.keys(dirtyVisibility).length;

  function isVisible(productId: string): boolean {
    if (productId in dirtyVisibility) return dirtyVisibility[productId];
    return !hidden.has(productId);
  }

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token ?? ""}`,
      };

      const priceEntries = Object.entries(dirty)
        .filter(([, v]) => Number.isFinite(v) && v >= 0)
        .map(([product_id, customer_price]) => ({ product_id, customer_price }));
      if (priceEntries.length > 0) {
        const res = await fetch("/api/storefront/tenant/prices", {
          method: "PUT",
          headers,
          body: JSON.stringify({ entries: priceEntries }),
        });
        if (!res.ok) throw new Error(await res.text());
      }

      const visEntries = Object.entries(dirtyVisibility).map(([product_id, visible]) => ({
        product_id,
        hidden: !visible,
      }));
      if (visEntries.length > 0) {
        const res = await fetch("/api/storefront/tenant/visibility", {
          method: "PUT",
          headers,
          body: JSON.stringify({ entries: visEntries }),
        });
        if (!res.ok) throw new Error(await res.text());
      }

      setDirty({});
      setDirtyVisibility({});
      await load();
      setNotice("Saved — your storefront reflects these changes immediately.");
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
          <h1 className="text-2xl font-semibold mt-1">Customer prices &amp; catalog</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Set the price your customers see and choose which products appear
            in your storefront. Base is your cost — the difference is your
            margin at checkout. Prices below base are blocked at checkout.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || dirtyCount === 0}
          className="rounded-md bg-black text-white px-5 py-2 text-sm disabled:opacity-60"
        >
          {saving ? "Saving…" : `Save (${dirtyCount})`}
        </button>
      </div>
      {error ? <div className="mt-4 text-red-700 text-sm">{error}</div> : null}
      {notice ? <div className="mt-4 text-green-700 text-sm">✓ {notice}</div> : null}
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs text-gray-500 uppercase">
          <tr>
            <th className="py-2">SKU</th>
            <th className="py-2">Product</th>
            <th className="py-2 text-center">Visible</th>
            <th className="py-2 text-right">Base (your cost)</th>
            <th className="py-2 text-right">Your price</th>
            <th className="py-2 text-right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const current = priceByProduct.get(p.id);
            const base = basePrices[p.id] ?? Number(p.price);
            const stored = current ? Number(current.customer_price) : base;
            const value = dirty[p.id] !== undefined ? dirty[p.id] : stored;
            const margin = value - base;
            const belowBase = Number.isFinite(value) && value < base;
            const visible = isVisible(p.id);
            return (
              <tr key={p.id} className={`border-t ${visible ? "" : "opacity-50"}`}>
                <td className="py-2">{p.sku}</td>
                <td className="py-2">{p.name}</td>
                <td className="py-2 text-center">
                  <button
                    type="button"
                    onClick={() =>
                      setDirtyVisibility((d) => {
                        const next = { ...d };
                        const target = !visible;
                        // Toggling back to the stored state clears the
                        // pending change instead of recording a no-op.
                        if (target === !hidden.has(p.id)) delete next[p.id];
                        else next[p.id] = target;
                        return next;
                      })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium cursor-pointer transition-colors ${
                      visible
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                    }`}
                    title={visible ? "Shown in your storefront — click to hide" : "Hidden from your storefront — click to show"}
                  >
                    {visible ? "Shown" : "Hidden"}
                  </button>
                </td>
                <td className="py-2 text-right text-gray-500">
                  ${base.toFixed(2)}
                </td>
                <td className="py-2 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={value}
                    className={`w-28 text-right border rounded px-2 py-1 ${belowBase ? "border-red-400 bg-red-50" : ""}`}
                    onChange={(e) =>
                      setDirty((d) => ({ ...d, [p.id]: Number(e.target.value) }))
                    }
                  />
                </td>
                <td className={`py-2 text-right font-medium ${marginClass(belowBase, margin)}`}>
                  {belowBase ? "below base" : `$${margin.toFixed(2)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
