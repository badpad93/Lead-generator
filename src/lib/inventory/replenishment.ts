/**
 * Replenishment orchestration.
 *
 * Owns the impure work around the pure forecast engine:
 *   - loading the run's config snapshot
 *   - resolving per-SKU overrides against defaults
 *   - deriving weekly usage from inventory_transactions
 *   - reading on-hand and open-inbound at the run's as-of moment
 *   - calling calculateForecast() with the assembled inputs
 *   - persisting the recommendation with its full snapshot
 *   - superseding any prior proposed recommendation for the same
 *     (sku_id, warehouse_id)
 *   - approving / overriding / creating POs from approved recs
 *
 * Every decision that isn't a raw formula step lives here so
 * forecast.ts stays deterministic.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import {
  calculateForecast,
  ForecastInputs,
  ForecastOutputs,
  WeeklyUsageEntry,
} from "./forecast";
import { computeOnHand } from "./ledger";
import { createPurchaseOrder } from "./purchaseOrders";
import type {
  ForecastMethod,
  InventoryConfigurationRow,
  InventorySkuRow,
  WeightBucket,
} from "./types";

// ─── Types ──────────────────────────────────────────────────────────

export interface RunReplenishmentInput {
  warehouseId: string;
  asOfDate?: string; // ISO date, defaults to now
  skuIds?: string[]; // optional filter — omit to run all active SKUs
  notes?: string | null;
  actorId?: string | null;
}

export interface RunReplenishmentResult {
  runId: string;
  formulaVersion: number;
  linesCount: number;
  proposedCount: number;
  skippedCount: number;
  recommendationIds: string[];
  skippedSkus: Array<{ sku_id: string; reason: string }>;
}

// ─── Public — run ──────────────────────────────────────────────────

export async function runReplenishment(
  input: RunReplenishmentInput,
): Promise<RunReplenishmentResult> {
  const asOfDate = input.asOfDate ?? new Date().toISOString().slice(0, 10);
  const asOfIso = new Date(`${asOfDate}T23:59:59.999Z`).toISOString();

  const config = await loadConfig();

  // Load candidate SKUs. If skuIds provided, filter; otherwise all active.
  let skuQuery = supabaseAdmin
    .from("inventory_skus")
    .select("*")
    .eq("active", true);
  if (input.skuIds && input.skuIds.length > 0) {
    skuQuery = skuQuery.in("id", input.skuIds);
  }
  const { data: skusRaw } = await skuQuery;
  const skus = (skusRaw ?? []) as InventorySkuRow[];

  // Create the run header first so recommendations can foreign-key into it.
  const inputSnapshot = {
    as_of_date: asOfDate,
    default_lookback_weeks: config.default_lookback_weeks,
    default_safety_stock_pct: config.default_safety_stock_pct,
    default_order_cycle_days: config.default_order_cycle_days,
    default_forecast_method: config.default_forecast_method,
    default_weight_config: config.default_weight_config,
    spike_threshold_multiplier: config.spike_threshold_multiplier,
    min_valid_weeks: config.min_valid_weeks,
    sku_id_filter: input.skuIds ?? null,
  };
  const { data: runRow, error: runErr } = await supabaseAdmin
    .from("replenishment_runs")
    .insert({
      warehouse_id: input.warehouseId,
      formula_version: config.current_formula_version,
      as_of_date: asOfDate,
      input_snapshot: inputSnapshot,
      lines_count: 0,
      proposed_count: 0,
      skipped_count: 0,
      notes: input.notes ?? null,
      created_by: input.actorId ?? null,
    })
    .select("id")
    .single();
  if (runErr || !runRow) throw runErr ?? new Error("run insert failed");
  const runId = runRow.id as string;

  const result: RunReplenishmentResult = {
    runId,
    formulaVersion: config.current_formula_version,
    linesCount: skus.length,
    proposedCount: 0,
    skippedCount: 0,
    recommendationIds: [],
    skippedSkus: [],
  };

  for (const sku of skus) {
    try {
      const rec = await runOneSku({
        sku,
        warehouseId: input.warehouseId,
        asOfIso,
        config,
        runId,
        formulaVersion: config.current_formula_version,
        actorId: input.actorId ?? null,
      });
      result.recommendationIds.push(rec.id);
      result.proposedCount += 1;
    } catch (err) {
      result.skippedCount += 1;
      result.skippedSkus.push({
        sku_id: sku.id,
        reason: err instanceof Error ? err.message : "unknown",
      });
      console.error(
        `[replenishment.runOneSku] sku=${sku.sku_code} failed:`,
        err,
      );
    }
  }

  // Update run rollup counts.
  await supabaseAdmin
    .from("replenishment_runs")
    .update({
      lines_count: result.linesCount,
      proposed_count: result.proposedCount,
      skipped_count: result.skippedCount,
    })
    .eq("id", runId);

  return result;
}

// ─── Public — approve / override / ignore / restore ───────────────

export async function overrideRecommendation(
  recommendationId: string,
  finalOrderQty: number,
  reason: string,
  actorId: string | null,
): Promise<void> {
  if (!reason || !reason.trim()) {
    throw new Error("override reason is required");
  }
  if (!(finalOrderQty >= 0)) {
    throw new Error("finalOrderQty must be ≥ 0");
  }
  const { error } = await supabaseAdmin
    .from("replenishment_recommendations")
    .update({
      final_order_qty: finalOrderQty,
      override_reason: reason.trim(),
      status: "approved",
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendationId)
    .in("status", ["proposed", "approved"]);
  if (error) throw error;
}

export async function approveRecommendation(
  recommendationId: string,
  actorId: string | null,
): Promise<void> {
  const { data: current } = await supabaseAdmin
    .from("replenishment_recommendations")
    .select("recommended_qty, status, final_order_qty")
    .eq("id", recommendationId)
    .maybeSingle();
  if (!current) throw new Error("recommendation not found");
  if (current.status !== "proposed" && current.status !== "approved") {
    throw new Error(`cannot approve recommendation in status ${current.status}`);
  }
  const finalQty = current.final_order_qty ?? current.recommended_qty;
  const { error } = await supabaseAdmin
    .from("replenishment_recommendations")
    .update({
      status: "approved",
      final_order_qty: finalQty,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendationId);
  if (error) throw error;
}

export async function ignoreRecommendation(
  recommendationId: string,
  actorId: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("replenishment_recommendations")
    .update({
      status: "ignored",
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recommendationId)
    .in("status", ["proposed", "approved"]);
  if (error) throw error;
}

// ─── Public — create POs from approved recommendations ─────────────

export interface CreatePosFromRunResult {
  purchaseOrderIds: string[];
  linesTotal: number;
  bySupplier: Record<string, string>; // supplier_id → po_id
}

/**
 * Groups all approved recommendations for a run by supplier
 * (`inventory_skus.preferred_supplier_id`) and creates one draft PO
 * per supplier. Recommendations flip to `ordered` with the PO id
 * tagged. Recommendations with no preferred supplier are skipped and
 * surfaced.
 */
export async function createPurchaseOrdersFromRun(
  runId: string,
  actorId: string | null,
): Promise<CreatePosFromRunResult> {
  const { data: recsRaw } = await supabaseAdmin
    .from("replenishment_recommendations")
    .select("*, inventory_skus:sku_id(preferred_supplier_id, pack_size, unit_cost_cents:preferred_supplier_id)")
    .eq("run_id", runId)
    .eq("status", "approved");
  const recs = (recsRaw ?? []) as Array<{
    id: string;
    sku_id: string;
    warehouse_id: string;
    final_order_qty: number | null;
    recommended_qty: number;
    inventory_skus: { preferred_supplier_id: string | null; pack_size: number } | null;
  }>;

  const bySupplier = new Map<string, typeof recs>();
  const skippedNoSupplier: typeof recs = [];
  for (const rec of recs) {
    const supplierId = rec.inventory_skus?.preferred_supplier_id ?? null;
    if (!supplierId) {
      skippedNoSupplier.push(rec);
      continue;
    }
    const list = bySupplier.get(supplierId) ?? [];
    list.push(rec);
    bySupplier.set(supplierId, list);
  }

  const result: CreatePosFromRunResult = {
    purchaseOrderIds: [],
    linesTotal: 0,
    bySupplier: {},
  };

  // Need warehouse_id for the PO. Recs in a single run share one
  // warehouse (see runReplenishment signature) — just read from the run.
  const { data: run } = await supabaseAdmin
    .from("replenishment_runs")
    .select("warehouse_id")
    .eq("id", runId)
    .single();
  const warehouseId = run?.warehouse_id as string;

  for (const [supplierId, list] of bySupplier) {
    const lines = list.map((r) => ({
      sku_id: r.sku_id,
      ordered_qty: r.final_order_qty ?? r.recommended_qty,
    }));
    const { purchaseOrder } = await createPurchaseOrder({
      supplier_id: supplierId,
      warehouse_id: warehouseId,
      replenishment_run_id: runId,
      lines,
      created_by: actorId,
    });
    result.purchaseOrderIds.push(purchaseOrder.id);
    result.bySupplier[supplierId] = purchaseOrder.id;
    result.linesTotal += lines.length;

    // Tag each rec as ordered.
    await supabaseAdmin
      .from("replenishment_recommendations")
      .update({
        status: "ordered",
        ordered_purchase_order_id: purchaseOrder.id,
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        list.map((r) => r.id),
      );
  }

  return result;
}

// ─── Internal — one SKU ────────────────────────────────────────────

async function runOneSku(args: {
  sku: InventorySkuRow;
  warehouseId: string;
  asOfIso: string;
  config: InventoryConfigurationRow;
  runId: string;
  formulaVersion: number;
  actorId: string | null;
}): Promise<{ id: string }> {
  const { sku, warehouseId, asOfIso, config, runId, formulaVersion } = args;

  // Resolve overrides.
  const lookbackWeeks = sku.lookback_weeks_override ?? config.default_lookback_weeks;
  const safetyStockPct = sku.safety_stock_pct_override ?? config.default_safety_stock_pct;
  const forecastMethod: ForecastMethod =
    sku.forecast_method_override ?? config.default_forecast_method;
  const packSize = Math.max(1, Number(sku.pack_size ?? 1));
  const orderCycleDays = config.default_order_cycle_days;

  // Lead time: SKU override → supplier → global default fallback.
  let leadTimeDays = sku.lead_time_days_override ?? null;
  const supplierIdUsed: string | null = sku.preferred_supplier_id;
  if (leadTimeDays == null && sku.preferred_supplier_id) {
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("lead_time_days")
      .eq("id", sku.preferred_supplier_id)
      .maybeSingle();
    if (supplier) leadTimeDays = supplier.lead_time_days;
  }
  if (leadTimeDays == null) leadTimeDays = 7;

  // Weekly usage from the ledger.
  const weekly = await deriveWeeklyUsage(sku.id, warehouseId, asOfIso, lookbackWeeks);

  // On-hand + open inbound.
  const onHand = await computeOnHand(sku.id, warehouseId);
  const { data: openInboundRaw } = await supabaseAdmin.rpc("open_inbound_qty", {
    p_sku_id: sku.id,
    p_warehouse_id: warehouseId,
  });
  const openInbound = Number(openInboundRaw ?? 0);

  const inputs: ForecastInputs = {
    weekly_usage: weekly,
    on_hand: onHand,
    open_inbound: openInbound,
    lead_time_days: leadTimeDays,
    order_cycle_days: orderCycleDays,
    safety_stock_pct: safetyStockPct,
    pack_size: packSize,
    forecast_method: forecastMethod,
    weight_config: config.default_weight_config,
    spike_threshold_multiplier: config.spike_threshold_multiplier,
    min_valid_weeks: config.min_valid_weeks,
  };

  const outputs: ForecastOutputs = calculateForecast(inputs, formulaVersion);

  // Supersede any prior 'proposed' rec for this SKU/warehouse.
  await supabaseAdmin
    .from("replenishment_recommendations")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
    })
    .eq("sku_id", sku.id)
    .eq("warehouse_id", warehouseId)
    .eq("status", "proposed");

  // Insert the new recommendation with the full snapshot.
  const { data, error } = await supabaseAdmin
    .from("replenishment_recommendations")
    .insert({
      run_id: runId,
      sku_id: sku.id,
      warehouse_id: warehouseId,
      formula_version: formulaVersion,

      weekly_usage_snapshot: outputs.weekly_usage_annotated,
      weeks_used_count: outputs.weeks_used_count,
      weeks_excluded_count: outputs.weeks_excluded_count,
      weeks_excluded_reasons: outputs.weeks_excluded_reasons,
      on_hand_at_run: onHand,
      open_inbound_at_run: openInbound,
      supplier_id_used: supplierIdUsed,
      lead_time_days_used: leadTimeDays,
      order_cycle_days_used: orderCycleDays,
      safety_stock_pct_used: safetyStockPct,
      lookback_weeks_used: lookbackWeeks,
      forecast_method_used: forecastMethod,
      weight_config_used:
        forecastMethod === "weighted" ? config.default_weight_config : null,
      pack_size_used: packSize,
      spike_threshold_used: config.spike_threshold_multiplier,

      avg_weekly_usage: outputs.avg_weekly_usage,
      coverage_weeks: outputs.coverage_weeks,
      base_need: outputs.base_need,
      safety_stock_qty: outputs.safety_stock_qty,
      target_stock_qty: outputs.target_stock_qty,
      net_need: outputs.net_need,
      recommended_qty: outputs.recommended_qty,

      confidence: outputs.confidence,
      flags: outputs.flags,
      status: "proposed",
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("recommendation insert failed");
  return { id: data.id as string };
}

// ─── Internal — derive weekly usage from ledger ────────────────────

async function deriveWeeklyUsage(
  skuId: string,
  warehouseId: string,
  asOfIso: string,
  lookbackWeeks: number,
): Promise<WeeklyUsageEntry[]> {
  // Build Monday-anchored week windows going back lookbackWeeks
  // (adaptive: caller may adjust; engine also flags INSUFFICIENT_HISTORY).
  const asOf = new Date(asOfIso);
  const asOfMonday = mondayOf(asOf);
  const weeks: { start: Date; end: Date }[] = [];
  for (let i = lookbackWeeks - 1; i >= 0; i--) {
    const start = new Date(asOfMonday);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    weeks.push({ start, end });
  }
  const oldestStartIso = weeks[0].start.toISOString();

  // Pull all consumption + reversal rows in the window in one query.
  const { data } = await supabaseAdmin
    .from("inventory_transactions")
    .select("qty_delta, transaction_type, created_at")
    .eq("sku_id", skuId)
    .eq("warehouse_id", warehouseId)
    .in("transaction_type", ["consumption", "consumption_reversal"])
    .gte("created_at", oldestStartIso)
    .lt("created_at", asOfIso);
  const rows = (data ?? []) as Array<{
    qty_delta: number;
    transaction_type: string;
    created_at: string;
  }>;

  return weeks.map((w) => {
    let net = 0;
    for (const r of rows) {
      const ts = new Date(r.created_at).getTime();
      if (ts >= w.start.getTime() && ts < w.end.getTime()) {
        // Sum qty_delta then negate at the end so positive = outflow.
        net += Number(r.qty_delta);
      }
    }
    const unitsUsed = Math.max(0, -net);
    return {
      week_start: w.start.toISOString().slice(0, 10),
      units_used: unitsUsed,
      stockout_flag: false, // v1 does not auto-detect
      excluded: false,
      exclusion_reason: null,
    };
  });
}

function mondayOf(d: Date): Date {
  // Return the UTC Monday of the week containing d.
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay(); // 0=Sun ... 6=Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offsetToMonday);
  utc.setUTCHours(0, 0, 0, 0);
  return utc;
}

async function loadConfig(): Promise<InventoryConfigurationRow> {
  const { data, error } = await supabaseAdmin
    .from("inventory_configuration")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("inventory_configuration row missing");
  return {
    ...data,
    default_weight_config: normalizeWeights(data.default_weight_config),
  } as InventoryConfigurationRow;
}

function normalizeWeights(raw: unknown): WeightBucket[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (b): b is WeightBucket =>
        !!b &&
        typeof b === "object" &&
        typeof (b as WeightBucket).weeks_back_from === "number" &&
        typeof (b as WeightBucket).weeks_back_to === "number" &&
        typeof (b as WeightBucket).weight === "number",
    )
    .map((b) => ({
      weeks_back_from: b.weeks_back_from,
      weeks_back_to: b.weeks_back_to,
      weight: b.weight,
    }));
}
