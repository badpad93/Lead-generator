"use client";

/**
 * Admin Inventory — Replenishment page.
 *
 * The one screen the whole system serves. Every action from
 * "confirm on-hand counts" through "draft POs are ready to send"
 * lives here.
 *
 * Data plumbing:
 *   1. Load warehouses, pick one (default: first active).
 *   2. Fetch latest replenishment_runs row for that warehouse.
 *   3. Fetch its recommendations + on-hand + open-inbound.
 *   4. Present as one grid; buttons for Calculate, Create POs.
 *
 * State transitions all round-trip through the Phase 4 endpoints so
 * the state machine (proposed → approved → ordered) can't be
 * sidestepped from the UI.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2,
  Package,
  Calculator,
  ShoppingCart,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pencil,
  Info,
  Warehouse,
  Upload,
} from "lucide-react";

interface WarehouseRow {
  id: string;
  name: string;
  code: string | null;
  active: boolean;
}

interface RunRow {
  id: string;
  warehouse_id: string;
  formula_version: number;
  as_of_date: string;
  lines_count: number;
  proposed_count: number;
  skipped_count: number;
  notes: string | null;
  created_at: string;
}

interface Recommendation {
  id: string;
  run_id: string;
  sku_id: string;
  warehouse_id: string;
  formula_version: number;
  weekly_usage_snapshot: Array<{
    week_start: string;
    units_used: number;
    stockout_flag: boolean;
    excluded: boolean;
    exclusion_reason: string | null;
  }>;
  weeks_used_count: number;
  weeks_excluded_count: number;
  on_hand_at_run: number;
  open_inbound_at_run: number;
  supplier_id_used: string | null;
  lead_time_days_used: number;
  order_cycle_days_used: number;
  safety_stock_pct_used: number;
  lookback_weeks_used: number;
  forecast_method_used: "simple" | "weighted";
  pack_size_used: number;
  avg_weekly_usage: number;
  coverage_weeks: number;
  base_need: number;
  safety_stock_qty: number;
  target_stock_qty: number;
  net_need: number;
  recommended_qty: number;
  confidence: "low" | "medium" | "high";
  flags: string[];
  status: "proposed" | "approved" | "ordered" | "ignored" | "superseded";
  final_order_qty: number | null;
  override_reason: string | null;
  ordered_purchase_order_id: string | null;
  reviewed_at: string | null;
  inventory_skus: {
    sku_code: string;
    name: string;
    category: string;
    unit_of_measure: string;
    pack_size: number;
    preferred_supplier_id: string | null;
  } | null;
  suppliers: { name: string; contact_email: string | null } | null;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  proposed: { label: "Proposed", cls: "bg-blue-50 text-blue-700 ring-blue-200" },
  approved: { label: "Approved", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  ordered: { label: "Ordered", cls: "bg-purple-50 text-purple-700 ring-purple-200" },
  ignored: { label: "Ignored", cls: "bg-gray-100 text-gray-500 ring-gray-200" },
  superseded: { label: "Superseded", cls: "bg-gray-50 text-gray-400 ring-gray-100 line-through" },
};

const CONFIDENCE_STYLE: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-emerald-50 text-emerald-700" },
  medium: { label: "Medium", cls: "bg-amber-50 text-amber-800" },
  low: { label: "Low", cls: "bg-red-50 text-red-700" },
};

export default function InventoryReplenishmentPage() {
  const [token, setToken] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [creatingPos, setCreatingPos] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [toast, setToast] = useState<{ tone: "success" | "error"; msg: string } | null>(null);
  const [countModal, setCountModal] = useState<Recommendation | null>(null);
  const [overrideModal, setOverrideModal] = useState<Recommendation | null>(null);
  const [importModalOpen, setImportModalOpen] = useState(false);
  // Bump to trigger a re-fetch of the run + recommendations after an
  // action succeeds. Preferred over an imperative reload() function to
  // stay compatible with React 19's purity rules on effects.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // Bootstrap — token + warehouses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || cancelled) return;
      setToken(session.access_token);
      const wRes = await fetch("/api/admin/inventory/warehouses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (wRes.ok && !cancelled) {
        const { warehouses: ws } = await wRes.json();
        setWarehouses(ws);
        const firstActive = ws.find((w: WarehouseRow) => w.active) ?? ws[0];
        if (firstActive) setWarehouseId(firstActive.id);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load the latest run + its recommendations whenever the warehouse
  // changes or reloadKey is bumped.
  useEffect(() => {
    if (!token || !warehouseId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const runsRes = await fetch(
        `/api/admin/inventory/replenishment/runs?warehouse_id=${warehouseId}&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!runsRes.ok || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }
      const { runs } = await runsRes.json();
      const latest = (runs?.[0] as RunRow | undefined) ?? null;
      if (cancelled) return;
      setRun(latest);
      if (!latest) {
        setRecs([]);
        setLoading(false);
        return;
      }
      const detailRes = await fetch(
        `/api/admin/inventory/replenishment/runs/${latest.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (detailRes.ok && !cancelled) {
        const { recommendations } = await detailRes.json();
        setRecs(recommendations ?? []);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token, warehouseId, reloadKey]);

  const filteredRecs = useMemo(() => {
    if (statusFilter === "all") return recs.filter((r) => r.status !== "superseded");
    return recs.filter((r) => r.status === statusFilter);
  }, [recs, statusFilter]);

  const approvedCount = useMemo(
    () => recs.filter((r) => r.status === "approved").length,
    [recs],
  );
  const proposedCount = useMemo(
    () => recs.filter((r) => r.status === "proposed").length,
    [recs],
  );

  function showToast(tone: "success" | "error", msg: string) {
    setToast({ tone, msg });
    setTimeout(() => setToast(null), 4000);
  }

  async function calculate() {
    if (!token || !warehouseId) return;
    setCalculating(true);
    const res = await fetch("/api/admin/inventory/replenishment/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ warehouse_id: warehouseId }),
    });
    if (res.ok) {
      const j = await res.json();
      showToast(
        "success",
        `Run complete: ${j.proposedCount} recommendations, ${j.skippedCount} skipped`,
      );
      reload();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.error ?? "Calculate failed");
    }
    setCalculating(false);
  }

  async function createDraftPOs() {
    if (!token || !run) return;
    if (!window.confirm(`Create draft POs from ${approvedCount} approved recommendation(s)?`)) return;
    setCreatingPos(true);
    const res = await fetch(
      `/api/admin/inventory/replenishment/runs/${run.id}/create-purchase-orders`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (res.ok) {
      const j = await res.json();
      showToast(
        "success",
        `Created ${j.purchaseOrderIds?.length ?? 0} draft PO(s), ${j.linesTotal ?? 0} lines`,
      );
      reload();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.error ?? "PO creation failed");
    }
    setCreatingPos(false);
  }

  async function actOnRec(rec: Recommendation, body: Record<string, unknown>) {
    if (!token) return;
    const res = await fetch(
      `/api/admin/inventory/replenishment/recommendations/${rec.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      reload();
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.error ?? "Action failed");
    }
  }

  async function submitCount(rec: Recommendation, qty: number, notes?: string) {
    if (!token || !warehouseId) return;
    const res = await fetch("/api/admin/inventory/counts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        sku_id: rec.sku_id,
        warehouse_id: warehouseId,
        counted_qty: qty,
        notes: notes ?? null,
      }),
    });
    if (res.ok) {
      const j = await res.json();
      showToast(
        "success",
        `Count saved. Ledger on-hand ${j.computedOnHandBefore} → ${j.computedOnHandAfter}.`,
      );
      setCountModal(null);
    } else {
      const err = await res.json().catch(() => ({}));
      showToast("error", err.error ?? "Count failed");
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
          <ChevronLeft className="h-4 w-4" /> Admin
        </Link>
        <Link
          href="/admin/inventory/setup"
          className="text-sm text-emerald-700 hover:underline"
        >
          Setup: warehouses, suppliers, SKUs, config →
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-emerald-600" />
            Inventory Replenishment
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Review counts, calculate recommendations, and turn approvals into draft purchase orders.
            Every recommendation is reproducible from its stored snapshot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={warehouseId ?? ""}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                <Warehouse className="inline h-3 w-3" /> {w.name}
                {w.code ? ` (${w.code})` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={calculate}
            disabled={calculating || !warehouseId}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            Calculate Recommendations
          </button>
          <button
            type="button"
            onClick={createDraftPOs}
            disabled={creatingPos || approvedCount === 0 || !run}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 text-white px-3 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            title={approvedCount === 0 ? "No approved recommendations" : `Create draft POs from ${approvedCount} approved`}
          >
            {creatingPos ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Create Draft POs ({approvedCount})
          </button>
          <button
            type="button"
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white text-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-50"
            title="Bulk import physical counts from CSV"
          >
            <Upload className="h-4 w-4" />
            Import Counts
          </button>
        </div>
      </div>

      {run && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 flex flex-wrap items-center gap-4">
          <span>
            Latest run: <strong className="text-gray-900">{new Date(run.created_at).toLocaleString()}</strong>
          </span>
          <span>
            As of: <strong className="text-gray-900">{run.as_of_date}</strong>
          </span>
          <span>
            Formula version: <strong className="text-gray-900">v{run.formula_version}</strong>
          </span>
          <span>
            Lines: <strong className="text-gray-900">{run.lines_count}</strong> · Proposed:{" "}
            <strong className="text-gray-900">{run.proposed_count}</strong> · Skipped:{" "}
            <strong className="text-gray-900">{run.skipped_count}</strong>
          </span>
        </div>
      )}

      {/* Status filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {[
          { key: "all", label: `All (${recs.filter((r) => r.status !== "superseded").length})` },
          { key: "proposed", label: `Proposed (${proposedCount})` },
          { key: "approved", label: `Approved (${approvedCount})` },
          { key: "ordered", label: `Ordered (${recs.filter((r) => r.status === "ordered").length})` },
          { key: "ignored", label: `Ignored (${recs.filter((r) => r.status === "ignored").length})` },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full px-3 py-1 border transition ${
              statusFilter === f.key
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">
          <Loader2 className="inline h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      ) : !run ? (
        <EmptyState onCalculate={calculate} calculating={calculating} />
      ) : filteredRecs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-500">
          No recommendations match this filter.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 w-8"></th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2 text-right">On Hand</th>
                <th className="px-3 py-2 text-right">Open Inbound</th>
                <th className="px-3 py-2 text-right">Avg/Wk</th>
                <th className="px-3 py-2 text-right">Target</th>
                <th className="px-3 py-2 text-right">Recommended</th>
                <th className="px-3 py-2 text-right">Final</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2">Flags</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecs.map((rec) => {
                const stat = STATUS_STYLE[rec.status];
                const conf = CONFIDENCE_STYLE[rec.confidence];
                const isExpanded = expanded === rec.id;
                return (
                  <>
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : rec.id)}
                          className="text-gray-400 hover:text-gray-700"
                          title="Show calculation detail"
                        >
                          {isExpanded ? "−" : "+"}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{rec.inventory_skus?.name ?? "(unknown SKU)"}</div>
                        <div className="text-[11px] text-gray-500 font-mono">
                          {rec.inventory_skus?.sku_code} · {rec.inventory_skus?.category}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {rec.suppliers?.name ?? <span className="text-red-600">— no supplier —</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        <button
                          type="button"
                          onClick={() => setCountModal(rec)}
                          className="hover:underline"
                          title="Record physical count"
                        >
                          {Number(rec.on_hand_at_run)}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{Number(rec.open_inbound_at_run)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmt(rec.avg_weekly_usage)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmt(rec.target_stock_qty)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900">
                        {Number(rec.recommended_qty)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {rec.final_order_qty != null ? (
                          <span className="font-semibold text-emerald-700">{Number(rec.final_order_qty)}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${stat.cls}`}>
                          {stat.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${conf.cls}`}>
                          {conf.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {rec.flags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {rec.flags.map((f) => (
                              <span
                                key={f}
                                className="inline-flex items-center gap-0.5 rounded bg-amber-50 text-amber-800 px-1.5 py-0.5 text-[10px]"
                                title={f}
                              >
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {f.replace(/_/g, " ").toLowerCase()}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {(rec.status === "proposed" || rec.status === "approved") && (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => actOnRec(rec, { action: "approve" })}
                              className="text-emerald-700 hover:bg-emerald-50 p-1 rounded"
                              title="Approve"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setOverrideModal(rec)}
                              className="text-blue-700 hover:bg-blue-50 p-1 rounded"
                              title="Override quantity"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => actOnRec(rec, { action: "ignore" })}
                              className="text-gray-500 hover:bg-gray-100 p-1 rounded"
                              title="Ignore"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${rec.id}-detail`} className="bg-gray-50">
                        <td colSpan={13} className="px-6 py-4">
                          <CalculationDetail rec={rec} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {countModal && (
        <CountModal
          rec={countModal}
          onClose={() => setCountModal(null)}
          onSubmit={(qty, notes) => submitCount(countModal, qty, notes)}
        />
      )}
      {importModalOpen && token && (
        <ImportModal
          token={token}
          onClose={() => setImportModalOpen(false)}
          onImported={() => {
            setImportModalOpen(false);
            reload();
            showToast("success", "Import complete — ledger refreshed");
          }}
        />
      )}
      {overrideModal && (
        <OverrideModal
          rec={overrideModal}
          onClose={() => setOverrideModal(null)}
          onSubmit={(qty, reason) =>
            actOnRec(overrideModal, { action: "override", final_order_qty: qty, reason }).then(() =>
              setOverrideModal(null),
            )
          }
        />
      )}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 rounded-lg shadow-lg px-4 py-3 text-sm font-medium text-white ${
            toast.tone === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function EmptyState({ onCalculate, calculating }: { onCalculate: () => void; calculating: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white p-12 text-center">
      <Package className="mx-auto h-10 w-10 text-gray-300 mb-3" />
      <h3 className="text-lg font-semibold text-gray-900">No recommendations yet</h3>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        The engine hasn&apos;t produced a run for this warehouse yet. Click Calculate to generate
        the first set of recommendations from your current on-hand ledger, weekly usage history,
        and open inbound POs.
      </p>
      <button
        type="button"
        onClick={onCalculate}
        disabled={calculating}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
      >
        {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
        Calculate Recommendations
      </button>
    </div>
  );
}

function CalculationDetail({ rec }: { rec: Recommendation }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2 flex items-center gap-1">
          <Info className="h-3 w-3" /> Formula (v{rec.formula_version})
        </div>
        <table className="text-xs w-full">
          <tbody className="text-gray-700">
            <Row label="Method" value={rec.forecast_method_used} />
            <Row label="Lookback used" value={`${rec.lookback_weeks_used} weeks (${rec.weeks_used_count} valid, ${rec.weeks_excluded_count} excluded)`} />
            <Row label="Lead time" value={`${rec.lead_time_days_used} days`} />
            <Row label="Order cycle" value={`${rec.order_cycle_days_used} days`} />
            <Row label="Coverage weeks" value={fmt(rec.coverage_weeks)} />
            <Row label="Average weekly usage" value={fmt(rec.avg_weekly_usage)} />
            <Row label="Base need" value={fmt(rec.base_need)} />
            <Row label="Safety stock %" value={`${(rec.safety_stock_pct_used * 100).toFixed(1)}%`} />
            <Row label="Safety stock qty" value={fmt(rec.safety_stock_qty)} />
            <Row label="Target stock" value={fmt(rec.target_stock_qty)} />
            <Row label="Net need" value={fmt(rec.net_need)} />
            <Row label="Pack size" value={rec.pack_size_used} />
            <Row label="Recommended qty" value={rec.recommended_qty} bold />
          </tbody>
        </table>
        {rec.override_reason && (
          <div className="mt-3 rounded bg-blue-50 border border-blue-200 p-2 text-xs">
            <strong>Override:</strong> {rec.override_reason}
          </div>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-2">
          Weekly usage snapshot
        </div>
        <table className="text-xs w-full">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">Week</th>
              <th className="py-1 text-right">Units</th>
              <th className="py-1">Note</th>
            </tr>
          </thead>
          <tbody className="text-gray-700">
            {rec.weekly_usage_snapshot.map((w) => (
              <tr key={w.week_start} className={w.excluded ? "text-gray-400 line-through" : ""}>
                <td className="py-1">{w.week_start}</td>
                <td className="py-1 text-right">{Number(w.units_used)}</td>
                <td className="py-1 text-[11px] text-gray-500">
                  {w.exclusion_reason ?? (w.stockout_flag ? "stockout" : "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: unknown; bold?: boolean }) {
  return (
    <tr>
      <td className="py-0.5 text-gray-500 pr-4">{label}</td>
      <td className={`py-0.5 text-right ${bold ? "font-semibold text-gray-900" : ""}`}>{String(value)}</td>
    </tr>
  );
}

function CountModal({
  rec,
  onClose,
  onSubmit,
}: {
  rec: Recommendation;
  onClose: () => void;
  onSubmit: (qty: number, notes?: string) => void;
}) {
  const [qty, setQty] = useState<string>(String(rec.on_hand_at_run));
  const [notes, setNotes] = useState<string>("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Record physical count</h2>
          <p className="text-xs text-gray-500 mt-1">
            {rec.inventory_skus?.name} · {rec.inventory_skus?.sku_code}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Ledger on-hand: <strong>{Number(rec.on_hand_at_run)}</strong>. If counted differs, a{" "}
            <em>count_adjustment</em> transaction is written for the variance.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Counted qty</label>
            <input
              type="number"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(Number(qty), notes || undefined)}
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
            >
              Save count
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverrideModal({
  rec,
  onClose,
  onSubmit,
}: {
  rec: Recommendation;
  onClose: () => void;
  onSubmit: (qty: number, reason: string) => void;
}) {
  const [qty, setQty] = useState<string>(
    String(rec.final_order_qty ?? rec.recommended_qty),
  );
  const [reason, setReason] = useState<string>(rec.override_reason ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Override recommended qty</h2>
          <p className="text-xs text-gray-500 mt-1">
            {rec.inventory_skus?.name} · engine recommended <strong>{Number(rec.recommended_qty)}</strong>.
            Original stays on file; the reason is audit-logged.
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Final order qty</label>
            <input
              type="number"
              step="1"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
              placeholder="Why deviating from recommendation? (audit-logged)"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit(Number(qty), reason.trim())}
              disabled={!reason.trim()}
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              Save override
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  const num = Number(n);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(num % 1 === 0 ? 0 : 2);
}

interface PreviewResp {
  mode: "preview";
  total_rows: number;
  valid_count: number;
  invalid_rows: Array<{ line_number: number; errors: string[]; raw: Record<string, string> }>;
  valid_sample: Array<{ line_number: number; sku_code: string; warehouse_code: string; counted_qty: number }>;
}

interface CommitResp {
  mode: "commit";
  total_rows: number;
  saved_count: number;
  failed_rows: Array<{ line_number: number; errors: string[] }>;
  invalid_rows: Array<{ line_number: number; errors: string[] }>;
}

function ImportModal({
  token,
  onClose,
  onImported,
}: {
  token: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function callApi(mode: "preview" | "commit"): Promise<PreviewResp | CommitResp | null> {
    if (!file) return null;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    const res = await fetch("/api/admin/inventory/import", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err.error ?? `${mode} failed`);
      return null;
    }
    return (await res.json()) as PreviewResp | CommitResp;
  }

  async function runPreview() {
    const r = await callApi("preview");
    if (r && r.mode === "preview") setPreview(r);
  }
  async function runCommit() {
    const r = await callApi("commit");
    if (r && r.mode === "commit") {
      const bad = r.failed_rows.length + r.invalid_rows.length;
      if (bad === 0) {
        onImported();
      } else {
        setError(
          `Saved ${r.saved_count}, ${bad} row(s) failed. Fix the CSV and re-import.`,
        );
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl my-8">
        <div className="p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Import physical counts (CSV)</h2>
          <p className="text-xs text-gray-500 mt-1">
            Columns: <code>sku_code, warehouse_code, counted_qty, notes</code> (notes optional).
            Excel users: File → Save As → CSV.
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
              className="text-sm"
            />
          </div>
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
          {preview && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
              <div className="flex flex-wrap gap-3 mb-2">
                <span>
                  Total rows: <strong>{preview.total_rows}</strong>
                </span>
                <span className="text-emerald-700">
                  Valid: <strong>{preview.valid_count}</strong>
                </span>
                <span className="text-red-700">
                  Invalid: <strong>{preview.invalid_rows.length}</strong>
                </span>
              </div>
              {preview.invalid_rows.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto">
                  <div className="font-medium text-red-700 mb-1">Invalid rows</div>
                  <ul className="space-y-1">
                    {preview.invalid_rows.slice(0, 20).map((r) => (
                      <li key={r.line_number} className="text-red-700">
                        Line {r.line_number}: {r.errors.join("; ")}
                      </li>
                    ))}
                    {preview.invalid_rows.length > 20 && (
                      <li className="text-gray-500">
                        …and {preview.invalid_rows.length - 20} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {preview.valid_sample.length > 0 && (
                <div className="mt-3 max-h-40 overflow-y-auto">
                  <div className="font-medium text-emerald-700 mb-1">
                    Sample of valid rows ({preview.valid_sample.length})
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {preview.valid_sample.slice(0, 10).map((r) => (
                        <tr key={r.line_number}>
                          <td className="py-0.5 pr-2 text-gray-500">L{r.line_number}</td>
                          <td className="py-0.5 pr-2 font-mono">{r.sku_code}</td>
                          <td className="py-0.5 pr-2 font-mono">{r.warehouse_code}</td>
                          <td className="py-0.5 text-right">{r.counted_qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={runPreview}
              disabled={!file || busy}
              className="rounded-md border border-gray-200 bg-white text-gray-700 px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
            </button>
            <button
              type="button"
              onClick={runCommit}
              disabled={!preview || preview.valid_count === 0 || busy}
              className="rounded-md bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
              title={
                !preview
                  ? "Run preview first"
                  : preview.valid_count === 0
                    ? "No valid rows to import"
                    : `Save ${preview.valid_count} counts`
              }
            >
              Commit {preview ? `(${preview.valid_count})` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
