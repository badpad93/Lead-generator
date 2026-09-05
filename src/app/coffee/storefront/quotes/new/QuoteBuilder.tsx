"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";

interface Product { id: string; name: string; sku: string; price: number }
interface Customer { id: string; full_name: string | null; email: string | null }
interface LineDraft { product_id: string; quantity: number; override_unit_price?: number | null }
interface PreviewLine {
  product_id: string; product_name: string; product_sku: string | null;
  quantity: number; unit_cost: number; tier_unit_price: number; quoted_unit_price: number;
  is_override: boolean; line_total: number; gross_profit: number; margin_pct: number;
}
interface PreviewTotals { subtotal: number; total: number; estCost: number; estGrossProfit: number; marginPct: number }

async function authHeader(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;

export default function QuoteBuilder({ quoteId }: { quoteId: string | null }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [tierNames, setTierNames] = useState<Record<string, string>>({ "1": "Tier 1", "2": "Tier 2", "3": "Tier 3" });
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [mode, setMode] = useState<"existing" | "prospect">("prospect");
  const [customerId, setCustomerId] = useState("");
  const [prospect, setProspect] = useState({ company: "", first_name: "", last_name: "", email: "", phone: "" });
  const [tier, setTier] = useState(1);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [notes, setNotes] = useState("");

  const [preview, setPreview] = useState<{ lines: PreviewLine[]; totals: PreviewTotals } | null>(null);
  const [savedId, setSavedId] = useState<string | null>(quoteId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  // Load tenant + catalog + customers, and an existing quote when editing.
  useEffect(() => {
    (async () => {
      const h = await authHeader();
      const t = await fetch("/api/storefront/tenant", { headers: h }).then((r) => (r.ok ? r.json() : null));
      const tenant = t?.tenant;
      if (tenant) {
        setSlug(tenant.slug);
        setTierNames((tenant.price_tier_names as Record<string, string>) ?? tierNames);
        const [p, c] = await Promise.all([
          fetch(`/api/storefront/public/${tenant.slug}`).then((r) => (r.ok ? r.json() : { products: [] })),
          fetch("/api/storefront/tenant/customers", { headers: h }).then((r) => (r.ok ? r.json() : { customers: [] })),
        ]);
        setProducts(p.products ?? []);
        setCustomers(c.customers ?? []);
      }
      if (quoteId) {
        const q = await fetch(`/api/storefront/quotes/${quoteId}`, { headers: h }).then((r) => (r.ok ? r.json() : null));
        if (q?.quote) {
          const qq = q.quote as Record<string, unknown>;
          setTier(Number(qq.selected_tier) || 1);
          setNotes((qq.notes as string) ?? "");
          if (qq.customer_profile_id) { setMode("existing"); setCustomerId(qq.customer_profile_id as string); }
          else { setMode("prospect"); setProspect((pr) => ({ ...pr, company: (qq.prospect_company as string) ?? "", email: (qq.prospect_email as string) ?? "", first_name: (qq.prospect_first_name as string) ?? "", last_name: (qq.prospect_last_name as string) ?? "" })); }
          setLines((q.lines as Array<Record<string, unknown>>).map((l) => ({ product_id: String(l.product_id), quantity: Number(l.quantity), override_unit_price: l.is_override ? Number(l.quoted_unit_price) : null })));
          if (qq.status !== "draft") setReadOnly(true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);

  // Live recalculation whenever tier or lines change.
  const recompute = useCallback(async () => {
    if (lines.length === 0) { setPreview(null); return; }
    const res = await fetch("/api/storefront/quotes/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ tier, lines }),
    });
    if (res.ok) setPreview(await res.json());
  }, [tier, lines]);
  useEffect(() => { void recompute(); }, [recompute]);

  const availableProducts = useMemo(
    () => products.filter((p) => !lines.some((l) => l.product_id === p.id)),
    [products, lines],
  );

  function addProduct(id: string) {
    if (!id) return;
    setLines((ls) => [...ls, { product_id: id, quantity: 1, override_unit_price: null }]);
  }
  function setLine(id: string, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l) => (l.product_id === id ? { ...l, ...patch } : l)));
  }
  function removeLine(id: string) {
    setLines((ls) => ls.filter((l) => l.product_id !== id));
  }

  function recipientPayload() {
    return mode === "existing"
      ? { customer_profile_id: customerId || null }
      : { prospect: { ...prospect } };
  }

  async function persist(): Promise<string | null> {
    setError(null);
    const h = { "Content-Type": "application/json", ...(await authHeader()) };
    if (savedId) {
      const res = await fetch(`/api/storefront/quotes/${savedId}`, { method: "PATCH", headers: h, body: JSON.stringify({ selected_tier: tier, lines, notes }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Save failed"); return null; }
      return savedId;
    }
    const res = await fetch("/api/storefront/quotes", { method: "POST", headers: h, body: JSON.stringify({ ...recipientPayload(), selected_tier: tier, lines, notes }) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Save failed"); return null; }
    const body = await res.json();
    const id = body.quote?.id ?? null;
    setSavedId(id);
    return id;
  }

  async function onSaveDraft() {
    setBusy(true); setMsg(null);
    const id = await persist();
    if (id) setMsg("Draft saved.");
    setBusy(false);
  }

  async function onSend() {
    setBusy(true); setMsg(null);
    const id = await persist();
    if (!id) { setBusy(false); return; }
    const res = await fetch(`/api/storefront/quotes/${id}/send`, { method: "POST", headers: await authHeader() });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Send failed"); setBusy(false); return; }
    const body = await res.json();
    setReadOnly(true);
    setMsg(body.emailed ? "Quote sent." : `Quote ready — share this link: ${body.quote_url}`);
    setBusy(false);
  }

  return (
    <div className="max-w-5xl mx-auto p-8">
      <Link href="/coffee/storefront/quotes" className="text-sm text-gray-500">← Quotes</Link>
      <h1 className="text-2xl font-semibold mt-1">{readOnly ? "Quote" : savedId ? "Edit quote" : "Create quote"}</h1>
      {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
      {msg ? <div className="mt-3 text-sm text-green-700 break-all">{msg}</div> : null}

      {/* Recipient */}
      <section className="mt-6 rounded-lg border border-gray-200 p-4">
        <div className="font-medium mb-3">Customer</div>
        <div className="flex gap-4 text-sm mb-3">
          <label className="flex items-center gap-1"><input type="radio" disabled={readOnly} checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing customer</label>
          <label className="flex items-center gap-1"><input type="radio" disabled={readOnly} checked={mode === "prospect"} onChange={() => setMode("prospect")} /> New prospect</label>
        </div>
        {mode === "existing" ? (
          <select disabled={readOnly} value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
            <option value="">Select a customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email || c.id}</option>)}
          </select>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input disabled={readOnly} placeholder="Company" value={prospect.company} onChange={(e) => setProspect({ ...prospect, company: e.target.value })} className="border rounded px-3 py-2 text-sm" />
            <input disabled={readOnly} placeholder="Email" value={prospect.email} onChange={(e) => setProspect({ ...prospect, email: e.target.value })} className="border rounded px-3 py-2 text-sm" />
            <input disabled={readOnly} placeholder="First name" value={prospect.first_name} onChange={(e) => setProspect({ ...prospect, first_name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
            <input disabled={readOnly} placeholder="Last name" value={prospect.last_name} onChange={(e) => setProspect({ ...prospect, last_name: e.target.value })} className="border rounded px-3 py-2 text-sm" />
          </div>
        )}
      </section>

      {/* Tier */}
      <section className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="font-medium">Pricing tier</div>
          <Link href="/coffee/storefront/pricing" className="text-xs text-blue-700 hover:underline">Edit tier pricing</Link>
        </div>
        <select disabled={readOnly} value={tier} onChange={(e) => setTier(Number(e.target.value))} className="mt-2 border rounded px-3 py-2 text-sm">
          {[1, 2, 3].map((t) => <option key={t} value={t}>{tierNames[String(t)] || `Tier ${t}`}</option>)}
        </select>
        <p className="mt-1 text-xs text-gray-500">Changing the tier recalculates every line. Editing tier pricing changes the storefront price for all customers on that tier.</p>
      </section>

      {/* Lines */}
      <section className="mt-4 rounded-lg border border-gray-200 p-4">
        <div className="font-medium mb-3">Products</div>
        {!readOnly && (
          <select value="" onChange={(e) => addProduct(e.target.value)} className="mb-3 border rounded px-3 py-2 text-sm">
            <option value="">Add a product…</option>
            {availableProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </select>
        )}
        {lines.length === 0 ? (
          <div className="text-sm text-gray-500">No products yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase">
                <th className="py-1">Product</th><th>Cost</th><th>Tier</th><th>Quoted</th><th>Qty</th><th>Margin</th><th className="text-right">Total</th><th />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const pv = preview?.lines.find((x) => x.product_id === l.product_id);
                const prod = products.find((p) => p.id === l.product_id);
                return (
                  <tr key={l.product_id} className="border-t border-gray-100">
                    <td className="py-1">{prod?.name ?? pv?.product_name ?? l.product_id}</td>
                    <td>{pv ? money(pv.unit_cost) : "—"}</td>
                    <td>{pv ? money(pv.tier_unit_price) : "—"}</td>
                    <td>
                      <input type="number" step="0.01" disabled={readOnly} value={l.override_unit_price ?? ""} placeholder={pv ? String(pv.tier_unit_price) : ""}
                        onChange={(e) => setLine(l.product_id, { override_unit_price: e.target.value === "" ? null : Number(e.target.value) })}
                        className="w-20 border rounded px-2 py-1 text-xs" />
                      {pv?.is_override ? <span className="ml-1 text-[10px] text-amber-700">custom</span> : null}
                    </td>
                    <td>
                      <input type="number" min={1} disabled={readOnly} value={l.quantity}
                        onChange={(e) => setLine(l.product_id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-16 border rounded px-2 py-1 text-xs" />
                    </td>
                    <td>{pv ? `${pv.margin_pct.toFixed(1)}%` : "—"}</td>
                    <td className="text-right">{pv ? money(pv.line_total) : "—"}</td>
                    <td className="text-right">{!readOnly && <button onClick={() => removeLine(l.product_id)} className="text-xs text-red-700">×</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Totals (internal) */}
      {preview ? (
        <section className="mt-4 rounded-lg border border-gray-200 p-4 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{money(preview.totals.subtotal)}</span></div>
          <div className="flex justify-between text-gray-600"><span>Estimated cost</span><span>{money(preview.totals.estCost)}</span></div>
          <div className="flex justify-between text-gray-600"><span>Estimated gross profit</span><span>{money(preview.totals.estGrossProfit)} ({preview.totals.marginPct.toFixed(1)}%)</span></div>
          <div className="flex justify-between font-semibold border-t border-gray-100 mt-2 pt-2"><span>Total</span><span>{money(preview.totals.total)}</span></div>
          <p className="mt-2 text-[11px] text-gray-400">Cost and margin are internal — never shown on the customer quote.</p>
        </section>
      ) : null}

      {!readOnly && (
        <div className="mt-6 flex gap-3">
          <button onClick={onSaveDraft} disabled={busy} className="rounded-md border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">Save draft</button>
          <button onClick={onSend} disabled={busy || lines.length === 0} className="rounded-md bg-black text-white px-4 py-2 text-sm disabled:opacity-50">Send quote</button>
        </div>
      )}
      {slug ? <p className="mt-3 text-xs text-gray-400">Customer sees {tierNames[String(tier)]} pricing on your storefront after enrollment.</p> : null}
    </div>
  );
}
