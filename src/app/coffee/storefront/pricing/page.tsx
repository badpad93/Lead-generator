"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

/**
 * Owner pricing tiers + catalog visibility for one storefront.
 *
 *   - THREE pricing tiers. For each product the owner can set a price
 *     in each tier; a blank cell falls back to the product's list
 *     price at checkout, so nothing has to be filled — prices already
 *     exist. Tiers can be renamed.
 *   - Each customer is assigned to a tier on the Customers page; their
 *     price for a product is their tier's price.
 *   - "Base" is the owner's true cost (assigned base tier, else list);
 *     margin = tier price − base. Below-base is flagged and refused at
 *     checkout.
 *   - "Visible" toggles storefront_tenant_hidden_products — a hidden
 *     product disappears from this storefront everywhere.
 */

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  active: boolean;
}
const TIERS = [1, 2, 3] as const;
type Tier = (typeof TIERS)[number];

function marginClass(belowBase: boolean, margin: number): string {
  if (belowBase) return "text-red-600";
  if (margin > 0) return "text-green-700";
  return "text-gray-500";
}

export default function PricingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [basePrices, setBasePrices] = useState<Record<string, number>>({});
  // tiers[tier][product_id] = price
  const [tiers, setTiers] = useState<Record<string, Record<string, number>>>({});
  const [tierNames, setTierNames] = useState<Record<string, string>>({ "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // dirty price edits keyed `${tier}:${product_id}`
  const [dirtyPrices, setDirtyPrices] = useState<Record<string, number>>({});
  const [dirtyNames, setDirtyNames] = useState<Record<string, string>>({});
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
    const [tierRes, productRes, visRes] = await Promise.all([
      fetch("/api/storefront/tenant/tier-prices", { headers: auth }),
      fetch("/api/coffee/products?active=1"),
      fetch("/api/storefront/tenant/visibility", { headers: auth }),
    ]);
    if (tierRes.ok) {
      const body = (await tierRes.json()) as {
        tiers: Record<string, Record<string, number>>;
        tier_names: Record<string, string>;
        base_prices: Record<string, number>;
      };
      setTiers(body.tiers ?? {});
      setTierNames(body.tier_names ?? { "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" });
      setBasePrices(body.base_prices ?? {});
    }
    if (productRes.ok) {
      const body = (await productRes.json()) as { products?: Product[] } | Product[];
      setProducts(Array.isArray(body) ? body : (body.products ?? []));
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

  const dirtyCount =
    Object.keys(dirtyPrices).length +
    Object.keys(dirtyNames).length +
    Object.keys(dirtyVisibility).length;

  function tierName(t: Tier): string {
    return dirtyNames[String(t)] ?? tierNames[String(t)] ?? `Tier ${t}`;
  }
  function isVisible(productId: string): boolean {
    if (productId in dirtyVisibility) return dirtyVisibility[productId];
    return !hidden.has(productId);
  }
  /** Displayed value for a (tier, product) cell: pending edit, then
   *  stored tier price, then the product list price as the default. */
  function cellValue(t: Tier, p: Product): number {
    const key = `${t}:${p.id}`;
    if (key in dirtyPrices) return dirtyPrices[key];
    const stored = tiers[String(t)]?.[p.id];
    if (stored != null) return stored;
    return basePrices[p.id] ?? Number(p.price);
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

      const entries = Object.entries(dirtyPrices)
        .filter(([, v]) => Number.isFinite(v) && v >= 0)
        .map(([k, customer_price]) => {
          const [tier, product_id] = k.split(":");
          return { tier: Number(tier), product_id, customer_price };
        });
      const namesPayload =
        Object.keys(dirtyNames).length > 0
          ? { ...tierNames, ...dirtyNames }
          : undefined;

      if (entries.length > 0 || namesPayload) {
        const res = await fetch("/api/storefront/tenant/tier-prices", {
          method: "PUT",
          headers,
          body: JSON.stringify({ entries, tier_names: namesPayload }),
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

      setDirtyPrices({});
      setDirtyNames({});
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
    <div className="max-w-6xl mx-auto p-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/coffee/storefront" className="text-sm text-gray-500">
            ← Storefront
          </Link>
          <h1 className="text-2xl font-semibold mt-1">Pricing tiers &amp; catalog</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-3xl">
            Set up to three price tiers, then assign each customer to a
            tier on the <Link href="/coffee/storefront/customers" className="underline">Customers</Link> page.
            A blank tier cell charges the product&apos;s list price, so you only
            fill a cell to change it. Base is your cost; prices below base are
            blocked at checkout.
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

      {/* Tier name editors */}
      <div className="mt-6 flex flex-wrap gap-4">
        {TIERS.map((t) => (
          <label key={t} className="text-xs text-gray-500">
            Tier {t} name
            <input
              value={tierName(t)}
              onChange={(e) => setDirtyNames((d) => ({ ...d, [String(t)]: e.target.value }))}
              className="mt-1 block w-40 border rounded px-2 py-1 text-sm text-gray-900"
            />
          </label>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500 uppercase">
            <tr>
              <th className="py-2">SKU</th>
              <th className="py-2">Product</th>
              <th className="py-2 text-center">Visible</th>
              <th className="py-2 text-right">Base</th>
              {TIERS.map((t) => (
                <th key={t} className="py-2 text-right">{tierName(t)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const base = basePrices[p.id] ?? Number(p.price);
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
                    >
                      {visible ? "Shown" : "Hidden"}
                    </button>
                  </td>
                  <td className="py-2 text-right text-gray-500">${base.toFixed(2)}</td>
                  {TIERS.map((t) => {
                    const value = cellValue(t, p);
                    const margin = value - base;
                    const belowBase = Number.isFinite(value) && value < base;
                    return (
                      <td key={t} className="py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={value}
                          className={`w-24 text-right border rounded px-2 py-1 ${belowBase ? "border-red-400 bg-red-50" : ""}`}
                          onChange={(e) =>
                            setDirtyPrices((d) => ({ ...d, [`${t}:${p.id}`]: Number(e.target.value) }))
                          }
                        />
                        <div className={`text-[10px] mt-0.5 ${marginClass(belowBase, margin)}`}>
                          {belowBase ? "below base" : `+$${margin.toFixed(2)}`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
