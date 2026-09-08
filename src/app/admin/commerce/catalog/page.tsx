"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import type { ReadinessReport, ReadinessRow, MappingSuggestion } from "@/lib/commerce/catalogReadiness";
import type { QuickBooksItemSummary } from "@/lib/commerce/quickbooksAdapter";

/**
 * Administrator-only Vinnie catalog readiness and QuickBooks Item mapping.
 * Reads the readiness report, optionally lists existing QuickBooks Items
 * (production only, read-only, on explicit request), and lets an
 * administrator link an Item id and a tax treatment to one catalog row
 * after an explicit confirmation. Mappings are written to Supabase only.
 */
type Report = ReadinessReport & { quickbooks_lookup: { available: boolean; reason: string | null } };
type Tax = "unset" | "qbo_automated" | "exempt";
type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };
const TAX_LABEL: Record<Tax, string> = { unset: "Unset (blocks checkout)", qbo_automated: "QuickBooks automated sales tax", exempt: "Exempt" };
const BTN = "rounded bg-green-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";

async function bearer(): Promise<string> {
  const { data } = await createBrowserClient().auth.getSession();
  return data.session?.access_token ?? "";
}

async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${await bearer()}`, ...(init?.headers ?? {}) } });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) return { ok: false, status: res.status, error: typeof body.error === "string" ? body.error : `Request failed (${res.status})` };
  return { ok: true, data: body as T };
}

const usd = (n: number | null) => (n === null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
function activeLabel(row: ReadinessRow): string {
  if (!row.exists) return "row missing";
  return row.active ? "yes" : "no";
}

function Freight({ rel }: { rel: ReadinessRow["freight_relationship"] }) {
  if (!rel) return <span className="text-gray-400">—</span>;
  return rel.role === "add_on" ? <span>Add-on of <code>{rel.parent_key}</code></span> : <span>Parent of <code>{rel.add_on_keys.join(", ")}</code></span>;
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{label}</span>;
}

function ItemPicker({ items, value, onChange }: { items: QuickBooksItemSummary[]; value: string; onChange: (v: string) => void }) {
  if (items.length === 0) {
    return <input value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} placeholder="QuickBooks Item id" className="rounded border px-2 py-1 text-sm" aria-label="QuickBooks Item id" />;
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded border px-2 py-1 text-sm" aria-label="QuickBooks Item">
      <option value="">— no Item —</option>
      {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` · ${i.sku}` : ""} · #{i.id}{i.active ? "" : " (inactive)"}</option>)}
    </select>
  );
}

interface EditorProps {
  row: ReadinessRow;
  items: QuickBooksItemSummary[];
  suggestion: MappingSuggestion | undefined;
  onSaved: (row: ReadinessRow) => void;
}

function confirmText(row: ReadinessRow, itemId: string, itemName: string | undefined, tax: Tax): string {
  const item = itemId ? `#${itemId}${itemName ? ` (${itemName})` : ""}` : "none";
  return `Map ${row.catalog_key} to QuickBooks Item ${item} with tax treatment "${tax}"?\n\nThis writes to the Vending Connector catalog only. No QuickBooks record is created or changed.`;
}

function MappingEditor({ row, items, suggestion, onSaved }: EditorProps) {
  const [itemId, setItemId] = useState<string>(row.qb_item_id ?? "");
  const [tax, setTax] = useState<Tax>((row.tax_treatment as Tax | null) ?? "unset");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const chosen = items.find((i) => i.id === itemId);
  const save = async () => {
    if (!window.confirm(confirmText(row, itemId, chosen?.name, tax))) return;
    setBusy(true);
    const r = await api<{ row: ReadinessRow; audit_id: string }>("/api/admin/commerce/catalog-mapping", {
      method: "POST",
      body: JSON.stringify({ catalog_key: row.catalog_key, qb_item_id: itemId || null, qb_item_name: chosen?.name ?? null, tax_treatment: tax, reason: reason || null, confirm: true }),
    });
    setBusy(false);
    if (!r.ok) return setMsg(r.error);
    setMsg(`Saved. Audit ${r.data.audit_id.slice(0, 8)}…`);
    onSaved(r.data.row);
  };
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
      <ItemPicker items={items} value={itemId} onChange={setItemId} />
      <select value={tax} onChange={(e) => setTax(e.target.value as Tax)} className="rounded border px-2 py-1 text-sm" aria-label="Tax treatment">
        {(Object.keys(TAX_LABEL) as Tax[]).map((t) => <option key={t} value={t}>{TAX_LABEL[t]}</option>)}
      </select>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (audit)" className="rounded border px-2 py-1 text-sm" aria-label="Reason" />
      <button type="button" onClick={() => void save()} disabled={busy} className={BTN}>{busy ? "Saving…" : "Save mapping"}</button>
      {suggestion ? <p className="text-xs text-gray-600 sm:col-span-4">Suggestion ({suggestion.basis.replace("_", " ")}): Item #{suggestion.qb_item_id} “{suggestion.qb_item_name}”. Not applied until you confirm.</p> : null}
      {msg ? <p className="text-xs text-gray-700 sm:col-span-4">{msg}</p> : null}
    </div>
  );
}

function RowFacts({ row }: { row: ReadinessRow }) {
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700 sm:grid-cols-4">
      <dt>Actual price</dt><dd className={row.price_matches ? "" : "text-amber-700"}>{usd(row.actual_price)} {row.price_matches ? "" : `(approved ${usd(row.approved_price)})`}</dd>
      <dt>Active</dt><dd>{activeLabel(row)}</dd>
      <dt>Freight</dt><dd><Freight rel={row.freight_relationship} /></dd>
      <dt>QuickBooks mapping</dt><dd>{row.qb_mapping_present ? `present (#${row.qb_item_id})` : "missing"}</dd>
      <dt>Tax treatment</dt><dd>{row.tax_treatment_present ? row.tax_treatment : "missing"}</dd>
      <dt className="sm:col-span-1">Reason</dt><dd className="sm:col-span-3">{row.reason}</dd>
    </dl>
  );
}

function RowCard({ row, items, suggestion, onSaved }: EditorProps) {
  return (
    <li className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-black-primary">{row.name} <code className="ml-1 text-xs text-gray-500">{row.catalog_key}</code></p>
          <p className="text-xs text-gray-600">{row.behavior}{row.agreement_requirement ? ` · agreement: ${row.agreement_requirement}` : ""}</p>
        </div>
        <Badge ok={row.ready} label={row.ready ? "Ready" : "Not ready"} />
      </div>
      <RowFacts row={row} />
      {row.payable && row.exists ? <MappingEditor row={row} items={items} suggestion={suggestion} onSaved={onSaved} /> : null}
    </li>
  );
}

function Header({ report, lookupBusy, onRefresh, onLookup }: { report: Report | null; lookupBusy: boolean; onRefresh: () => void; onLookup: () => void }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-black-primary"><ShieldCheck className="mr-2 inline h-6 w-6 text-green-primary" aria-hidden />Vinnie catalog readiness</h1>
        <p className="text-sm text-gray-600">Administrator only. Mappings are saved to the Vending Connector catalog and audited; QuickBooks is never written.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/admin" className="rounded border px-3 py-1.5 text-sm">Back to admin</Link>
        <button type="button" onClick={onRefresh} className="rounded border px-3 py-1.5 text-sm"><RefreshCw className="mr-1 inline h-4 w-4" aria-hidden />Refresh</button>
        <button type="button" onClick={onLookup} disabled={lookupBusy || !report?.quickbooks_lookup.available} title={report?.quickbooks_lookup.reason ?? undefined} className={BTN}>
          {lookupBusy ? "Loading…" : "Load QuickBooks Items (read-only)"}
        </button>
      </div>
    </div>
  );
}

function Notices({ report, error, loading }: { report: Report | null; error: string | null; loading: boolean }) {
  return (
    <>
      {report && !report.quickbooks_lookup.available ? <p className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">QuickBooks lookup is unavailable here: {report.quickbooks_lookup.reason} You can still enter an Item id by hand.</p> : null}
      {error ? <p className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {loading ? <p className="text-sm text-gray-600"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden />Loading…</p> : null}
    </>
  );
}

function withSavedRow(report: Report, row: ReadinessRow): Report {
  const rows = report.rows.map((x) => (x.catalog_key === row.catalog_key ? row : x));
  return { ...report, rows, ready: rows.filter((x) => x.ready).length, not_ready: rows.filter((x) => !x.ready).length };
}

export default function AdminVinnieCatalogPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [items, setItems] = useState<QuickBooksItemSummary[]>([]);
  const [suggestions, setSuggestions] = useState<MappingSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookupBusy, setLookupBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Report>("/api/admin/commerce/catalog-readiness");
    setLoading(false);
    if (!r.ok) return setError(r.status === 403 ? "Administrator access is required." : r.error);
    setError(null);
    setReport(r.data);
  }, []);
  // Initial fetch: state is set only when the response arrives, never synchronously in the effect.
  const initial = useRef(load);
  useEffect(() => {
    const run = initial.current;
    const timer = setTimeout(() => void run(), 0);
    return () => clearTimeout(timer);
  }, []);

  const lookup = async () => {
    if (!window.confirm("List existing QuickBooks Items through the live production connection? This is read-only; nothing in QuickBooks is created or changed.")) return;
    setLookupBusy(true);
    const r = await api<{ items: QuickBooksItemSummary[]; suggestions: MappingSuggestion[] }>("/api/admin/commerce/qbo-items", { method: "POST", body: JSON.stringify({ request: "list_items" }) });
    setLookupBusy(false);
    if (!r.ok) return setError(r.error);
    setItems(r.data.items);
    setSuggestions(r.data.suggestions);
  };

  const suggestionFor = useMemo(() => new Map(suggestions.map((s) => [s.catalog_key, s])), [suggestions]);
  const onSaved = (row: ReadinessRow) => setReport((r) => (r ? withSavedRow(r, row) : r));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Header report={report} lookupBusy={lookupBusy} onRefresh={() => void load()} onLookup={() => void lookup()} />
      <Notices report={report} error={error} loading={loading} />
      {report ? <p className="mb-3 text-sm text-gray-700">{report.ready} of {report.total} approved records ready.</p> : null}
      {report ? <ul className="space-y-3">{report.rows.map((row) => <RowCard key={row.catalog_key} row={row} items={items} suggestion={suggestionFor.get(row.catalog_key)} onSaved={onSaved} />)}</ul> : null}
    </main>
  );
}
