"use client";

import { priceBreakdown, type PriceBreakdown, type PricingMode } from "@/lib/storefront/marginPricing";

const money = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const percent = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}%`);

function ModeToggle({
  mode,
  onModeChange,
  disabled,
}: {
  mode: PricingMode;
  onModeChange: (m: PricingMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm" role="group" aria-label="Pricing mode">
      {(["markup", "margin"] as PricingMode[]).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={mode === m}
          disabled={disabled}
          onClick={() => onModeChange(m)}
          className={`px-3 py-1.5 ${mode === m ? "bg-black text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
        >
          {m === "markup" ? "Markup %" : "Gross Margin %"}
        </button>
      ))}
    </div>
  );
}

function PctSlider({
  mode,
  pct,
  onPctChange,
  disabled,
  idPrefix,
}: {
  mode: PricingMode;
  pct: number;
  onPctChange: (p: number) => void;
  disabled: boolean;
  idPrefix: string;
}) {
  const sliderMax = mode === "markup" ? 200 : 95;
  const sliderValue = Math.max(0, Math.min(Number.isFinite(pct) ? pct : 0, sliderMax));
  const label = mode === "markup" ? "Markup" : "Gross margin";
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={`${label} percentage slider`}
        min={0}
        max={sliderMax}
        step={0.5}
        value={sliderValue}
        disabled={disabled}
        onChange={(e) => onPctChange(Number(e.target.value))}
        className="flex-1"
        id={`${idPrefix}-slider`}
      />
      <div className="flex items-center gap-1">
        <input
          type="number"
          aria-label={`${label} percentage`}
          step="0.01"
          value={Number.isFinite(pct) ? pct : ""}
          disabled={disabled}
          onChange={(e) => onPctChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-20 border rounded px-2 py-1 text-sm text-right"
          id={`${idPrefix}-input`}
        />
        <span className="text-sm text-gray-500">%</span>
      </div>
    </div>
  );
}

/** Live readout for a known unit cost: price + both equivalent percentages +
 *  per-unit gross profit, with below-cost / invalid warnings. */
function PriceReadout({ b }: { b: PriceBreakdown }) {
  return (
    <div className="text-xs text-gray-700 grid grid-cols-2 gap-x-4 gap-y-1">
      <div>Cost</div><div className="text-right font-mono">{money(b.cost)}</div>
      <div>Calculated price</div>
      <div className="text-right font-mono">
        {b.valid ? money(b.sellingPrice) : <span className="text-red-600">invalid</span>}
      </div>
      <div>Equivalent markup</div><div className="text-right font-mono">{percent(b.markupPct)}</div>
      <div>Equivalent gross margin</div><div className="text-right font-mono">{percent(b.marginPct)}</div>
      <div>Per-unit gross profit</div><div className="text-right font-mono">{money(b.unitGrossProfit)}</div>
      {b.belowCost ? (
        <div className="col-span-2 text-amber-700">⚠ Price is below cost (negative margin).</div>
      ) : null}
      {!b.valid && b.reason === "margin_ge_100" ? (
        <div className="col-span-2 text-red-600">Gross margin must be under 100%.</div>
      ) : null}
      {!b.valid && (b.reason === "missing_cost" || b.reason === "negative_cost") ? (
        <div className="col-span-2 text-gray-500">No cost on file — set a price manually.</div>
      ) : null}
    </div>
  );
}

/**
 * Shared markup% / gross-margin% control: a mode toggle
 * (Markup % | Gross Margin %), a slider and an exact numeric input kept in
 * sync, and — when a unit cost is supplied — a live readout (calculated
 * price, equivalent markup %, equivalent gross-margin %, per-unit gross
 * profit). Fully controlled; the parent owns mode + pct and decides how to
 * apply the resulting price (bulk to a tier, or to a single quote line).
 *
 * The slider is capped at practical visual limits, but the numeric input
 * accepts any valid value (negative for below-cost, or above the slider max)
 * so precise / out-of-range pricing stays reachable.
 */
export default function MarginPriceControl({
  mode,
  pct,
  onModeChange,
  onPctChange,
  cost = null,
  quantity = 1,
  disabled = false,
  idPrefix = "mpc",
}: {
  mode: PricingMode;
  pct: number;
  onModeChange: (m: PricingMode) => void;
  onPctChange: (p: number) => void;
  cost?: number | null;
  quantity?: number;
  disabled?: boolean;
  idPrefix?: string;
}) {
  const b = cost !== null && cost !== undefined
    ? priceBreakdown({ cost, pct, mode, quantity })
    : null;

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <ModeToggle mode={mode} onModeChange={onModeChange} disabled={disabled} />
      <PctSlider mode={mode} pct={pct} onPctChange={onPctChange} disabled={disabled} idPrefix={idPrefix} />
      {b ? <PriceReadout b={b} /> : null}
    </div>
  );
}
