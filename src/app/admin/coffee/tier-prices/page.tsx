"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, DollarSign, CheckCircle2, AlertCircle, Save } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Tier {
  id: string;
  tier_key: string;
  name: string;
  sort_order: number;
}

interface PriceCell {
  price: number;
  shipping_cost: number;
  updated_at: string | null;
  updated_by: string | null;
}

interface Row {
  product_id: string;
  product_name: string;
  product_sku: string;
  base_price: number;
  base_shipping_cost: number;
  active: boolean;
  prices: Record<string, PriceCell>;
}

interface Draft {
  price: string;
  shipping_cost: string;
}

export default function AdminCoffeeTierPricesPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}); // key: productId:tierId
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async (t: string) => {
    setLoading(true);
    const res = await fetch("/api/admin/coffee/tier-prices", {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) {
      const body = await res.json();
      setTiers(body.tiers || []);
      setRows(body.rows || []);
    } else {
      setError((await res.json().catch(() => ({}))).error || "Failed to load tier prices");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/coffee/tier-prices"); return; }
      setToken(session.access_token);
      load(session.access_token);
    });
  }, [router, load]);

  function cellKey(productId: string, tierId: string) {
    return `${productId}:${tierId}`;
  }

  function draftFor(productId: string, tierId: string, cell: PriceCell | undefined): Draft {
    const key = cellKey(productId, tierId);
    const d = drafts[key];
    if (d) return d;
    return {
      price: cell ? String(cell.price) : "",
      shipping_cost: cell ? String(cell.shipping_cost) : "",
    };
  }

  function updateDraft(productId: string, tierId: string, field: keyof Draft, value: string) {
    setDrafts((prev) => {
      const key = cellKey(productId, tierId);
      const cell = rows.find((r) => r.product_id === productId)?.prices[tierId];
      const base = prev[key] || {
        price: cell ? String(cell.price) : "",
        shipping_cost: cell ? String(cell.shipping_cost) : "",
      };
      return { ...prev, [key]: { ...base, [field]: value } };
    });
  }

  async function saveCell(productId: string, tierId: string) {
    setMessage(null); setError(null);
    const draft = drafts[cellKey(productId, tierId)];
    if (!draft) return;
    const priceNum = Number(draft.price);
    const shipNum = draft.shipping_cost === "" ? null : Number(draft.shipping_cost);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError("Price must be a non-negative number.");
      return;
    }
    if (shipNum !== null && (!Number.isFinite(shipNum) || shipNum < 0)) {
      setError("Shipping must be a non-negative number.");
      return;
    }
    setSaving(cellKey(productId, tierId));
    const res = await fetch("/api/admin/coffee/tier-prices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        product_id: productId,
        pricing_tier_id: tierId,
        price: priceNum,
        shipping_cost: shipNum,
      }),
    });
    setSaving(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Save failed");
      return;
    }
    setMessage("Saved. Only this tier / product cell was changed.");
    // Clear draft + reload so we pick up updated_at
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[cellKey(productId, tierId)];
      return next;
    });
    load(token);
  }

  const filteredRows = search.trim()
    ? rows.filter((r) => {
        const s = search.trim().toLowerCase();
        return r.product_name.toLowerCase().includes(s) || (r.product_sku || "").toLowerCase().includes(s);
      })
    : rows;

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <Link href="/admin/coffee" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-600 mb-4">
        <ArrowLeft className="h-4 w-4" /> Coffee Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-emerald-600" /> Coffee Pricing Tiers
        </h1>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          Each product carries one price per tier. Editing a single cell — say Tier 2 — leaves
          Tier 1 and Tier 3 untouched. Every change is written to the admin audit log with the
          before / after values.
        </p>
      </div>

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5" /> {message}
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5" /> {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by product name or SKU…"
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm"
        />
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {filteredRows.length} of {rows.length} products
        </span>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="text-left py-2 px-3 font-medium">Product</th>
              <th className="text-right py-2 px-3 font-medium">Base</th>
              {tiers.map((t) => (
                <th key={t.id} className="text-left py-2 px-3 font-medium">
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.product_id} className="border-b border-gray-50 align-top">
                <td className="py-3 px-3">
                  <p className="font-medium text-gray-900">{r.product_name}</p>
                  <p className="text-[11px] text-gray-400">{r.product_sku}</p>
                  {!r.active && <span className="text-[10px] text-red-600 uppercase">Inactive</span>}
                </td>
                <td className="py-3 px-3 text-right text-xs text-gray-500 whitespace-nowrap">
                  <p>${r.base_price.toFixed(2)}</p>
                  <p className="text-gray-400">+${r.base_shipping_cost.toFixed(2)} ship</p>
                </td>
                {tiers.map((t) => {
                  const cell = r.prices[t.id];
                  const draft = draftFor(r.product_id, t.id, cell);
                  const key = cellKey(r.product_id, t.id);
                  const dirty = !!drafts[key];
                  return (
                    <td key={t.id} className="py-3 px-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-gray-500">Price</label>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.price}
                            onChange={(e) => updateDraft(r.product_id, t.id, "price", e.target.value)}
                            className={`w-24 rounded-lg border px-2 py-1 text-sm ${dirty ? "border-emerald-400 bg-emerald-50" : "border-gray-200"}`}
                          />
                        </div>
                        <label className="text-[10px] text-gray-500 mt-1">Shipping</label>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">$</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.shipping_cost}
                            onChange={(e) => updateDraft(r.product_id, t.id, "shipping_cost", e.target.value)}
                            className={`w-24 rounded-lg border px-2 py-1 text-sm ${dirty ? "border-emerald-400 bg-emerald-50" : "border-gray-200"}`}
                          />
                        </div>
                        <button
                          onClick={() => saveCell(r.product_id, t.id)}
                          disabled={!dirty || saving === key}
                          className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                        >
                          {saving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          Save {t.name}
                        </button>
                        {cell?.updated_at && (
                          <p className="text-[10px] text-gray-400 mt-1">
                            Updated {new Date(cell.updated_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={2 + tiers.length} className="text-center text-sm text-gray-500 py-8">
                  No products match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
