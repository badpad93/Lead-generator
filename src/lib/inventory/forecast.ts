/**
 * Forecast engine — pure function of (inputs, formula_version).
 *
 * NO DATABASE ACCESS in this file. Callers gather every input
 * upstream (replenishment.ts owns that), pass it in, and receive the
 * outputs plus flags and confidence. This is what makes every stored
 * recommendation reproducible: pass the snapshot back to
 * calculateForecast(snapshot, formula_version) and you get the same
 * outputs, byte-for-byte.
 *
 * Adding a new formula = add a new case here + bump the config's
 * current_formula_version. Old recommendations stay valid because
 * they carry their own formula_version.
 *
 * Formula version 1:
 *   AWU              = simple or weighted average over lookback weeks
 *   coverage_weeks   = (lead_time_days + order_cycle_days) / 7
 *   base_need        = AWU × coverage_weeks
 *   safety_stock_qty = base_need × safety_stock_pct
 *   target_stock_qty = base_need + safety_stock_qty
 *   net_need         = target_stock_qty - on_hand - open_inbound
 *   recommended_qty  = MAX(0, CEIL(net_need / pack_size) × pack_size)
 */

import type { ForecastMethod, WeightBucket } from "./types";

export interface WeeklyUsageEntry {
  week_start: string;              // ISO date (Monday)
  units_used: number;              // net consumption for the week
  stockout_flag: boolean;          // week had a stockout event
  excluded: boolean;               // engine excluded this week from AWU
  exclusion_reason: string | null; // 'stockout' | 'spike' | ...
}

export interface ForecastInputs {
  /** Ordered oldest → newest (chronological). Engine reverses when
   * applying weighted buckets so weeks_back_from=1 = most recent. */
  weekly_usage: WeeklyUsageEntry[];
  on_hand: number;
  open_inbound: number;
  lead_time_days: number;
  order_cycle_days: number;
  safety_stock_pct: number;        // 0.10 = 10%
  pack_size: number;               // ≥ 1
  forecast_method: ForecastMethod; // 'simple' | 'weighted'
  weight_config: WeightBucket[];   // used only when method='weighted'
  spike_threshold_multiplier: number;
  min_valid_weeks: number;         // engine flags when < this many valid weeks
}

export interface ForecastOutputs {
  avg_weekly_usage: number;
  coverage_weeks: number;
  base_need: number;
  safety_stock_qty: number;
  target_stock_qty: number;
  net_need: number;
  recommended_qty: number;
  weeks_used_count: number;
  weeks_excluded_count: number;
  weeks_excluded_reasons: Record<string, number>;
  confidence: "low" | "medium" | "high";
  flags: string[];
  weekly_usage_annotated: WeeklyUsageEntry[]; // input with `excluded` set
}

const CURRENT_ENGINE_VERSIONS = [1] as const;
export type SupportedFormulaVersion = (typeof CURRENT_ENGINE_VERSIONS)[number];

export function isSupportedFormulaVersion(v: number): v is SupportedFormulaVersion {
  return (CURRENT_ENGINE_VERSIONS as readonly number[]).includes(v);
}

export function calculateForecast(
  inputs: ForecastInputs,
  formulaVersion: number,
): ForecastOutputs {
  if (formulaVersion === 1) return calculateV1(inputs);
  throw new Error(`unsupported formula version: ${formulaVersion}`);
}

// ── Formula V1 ─────────────────────────────────────────────────────

function calculateV1(inputs: ForecastInputs): ForecastOutputs {
  const flags: string[] = [];
  const excludedReasons: Record<string, number> = {};

  // 1. Annotate exclusions.
  //    - Stockout weeks: exclude when at least min_valid_weeks would
  //      remain after removal.
  //    - Spike weeks: flag but do NOT exclude (business decides later
  //      whether to promote to exclusion via config change).
  const weeksSortedNewestFirst = [...inputs.weekly_usage].reverse();
  const stockoutIdxs = weeksSortedNewestFirst
    .map((w, i) => (w.stockout_flag ? i : -1))
    .filter((i) => i >= 0);
  const nonStockoutCount = weeksSortedNewestFirst.length - stockoutIdxs.length;
  const canExcludeStockouts = nonStockoutCount >= inputs.min_valid_weeks;

  const median = medianOf(weeksSortedNewestFirst.map((w) => w.units_used));
  const spikeThreshold =
    median > 0 ? median * inputs.spike_threshold_multiplier : Infinity;

  const annotated: WeeklyUsageEntry[] = weeksSortedNewestFirst.map((w) => {
    let excluded = w.excluded;
    let reason: string | null = w.exclusion_reason;
    if (w.stockout_flag && canExcludeStockouts) {
      excluded = true;
      reason = "stockout";
    }
    if (w.units_used > spikeThreshold) {
      // Flag but do not exclude at v1.
      flags.push("DEMAND_SPIKE");
    }
    if (excluded && reason) {
      excludedReasons[reason] = (excludedReasons[reason] ?? 0) + 1;
    }
    return { ...w, excluded, exclusion_reason: reason };
  });

  // Restore chronological order for the returned annotated list.
  const annotatedChronological = [...annotated].reverse();

  // 2. Valid weeks used for AWU.
  const validWeeks = annotated.filter((w) => !w.excluded);
  const weeksUsedCount = validWeeks.length;
  const weeksExcludedCount = annotated.length - weeksUsedCount;

  if (weeksUsedCount === 0) {
    flags.push("NO_HISTORY");
  } else if (weeksUsedCount < inputs.min_valid_weeks) {
    flags.push("INSUFFICIENT_HISTORY");
  }

  if (validWeeks.length > 0 && validWeeks.every((w) => w.units_used === 0)) {
    flags.push("ZERO_USAGE");
  }
  if (inputs.pack_size === 1) {
    flags.push("MISSING_PACK_SIZE");
  }

  // 3. Average weekly usage.
  let avgWeeklyUsage = 0;
  if (weeksUsedCount > 0) {
    if (inputs.forecast_method === "simple") {
      avgWeeklyUsage =
        validWeeks.reduce((s, w) => s + w.units_used, 0) / weeksUsedCount;
    } else {
      avgWeeklyUsage = weightedAverage(validWeeks, inputs.weight_config);
    }
  }

  // 4. Formula body.
  const coverageWeeks = (inputs.lead_time_days + inputs.order_cycle_days) / 7;
  const baseNeed = avgWeeklyUsage * coverageWeeks;
  const safetyStockQty = baseNeed * inputs.safety_stock_pct;
  const targetStockQty = baseNeed + safetyStockQty;
  const netNeed = targetStockQty - inputs.on_hand - inputs.open_inbound;
  const packSize = Math.max(1, Math.floor(inputs.pack_size));
  const recommendedQty =
    netNeed <= 0 ? 0 : Math.ceil(netNeed / packSize) * packSize;

  // 5. Confidence.
  //    high   ≥ 8 valid weeks AND no non-informational flags
  //    medium ≥ min_valid_weeks weeks
  //    low    < min_valid_weeks OR NO_HISTORY
  const criticalFlags = flags.filter(
    (f) => f === "NO_HISTORY" || f === "INSUFFICIENT_HISTORY",
  );
  const confidence: "low" | "medium" | "high" =
    criticalFlags.length > 0
      ? "low"
      : weeksUsedCount >= 8
        ? "high"
        : "medium";

  return {
    avg_weekly_usage: round4(avgWeeklyUsage),
    coverage_weeks: round4(coverageWeeks),
    base_need: round4(baseNeed),
    safety_stock_qty: round4(safetyStockQty),
    target_stock_qty: round4(targetStockQty),
    net_need: round4(netNeed),
    recommended_qty: recommendedQty,
    weeks_used_count: weeksUsedCount,
    weeks_excluded_count: weeksExcludedCount,
    weeks_excluded_reasons: excludedReasons,
    confidence,
    flags: dedupe(flags),
    weekly_usage_annotated: annotatedChronological,
  };
}

// ── Helpers ────────────────────────────────────────────────────────

function weightedAverage(
  validWeeksNewestFirst: WeeklyUsageEntry[],
  buckets: WeightBucket[],
): number {
  // Bucket weeks_back_from/to are 1-indexed with 1 = most recent.
  // Weight per week is the bucket weight / bucket size, so each week
  // in the bucket gets an equal share.
  let numer = 0;
  let denom = 0;
  validWeeksNewestFirst.forEach((week, i) => {
    const weeksBack = i + 1;
    const bucket = buckets.find(
      (b) => weeksBack >= b.weeks_back_from && weeksBack <= b.weeks_back_to,
    );
    if (!bucket) return; // outside all buckets → ignored
    const bucketSize = bucket.weeks_back_to - bucket.weeks_back_from + 1;
    const perWeekWeight = bucket.weight / bucketSize;
    numer += perWeekWeight * week.units_used;
    denom += perWeekWeight;
  });
  return denom > 0 ? numer / denom : 0;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
