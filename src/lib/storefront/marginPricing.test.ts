import { describe, it, expect } from "vitest";
import {
  computeSellingPrice,
  equivalentMarkupPct,
  equivalentMarginPct,
  unitGrossProfit,
  pctFromPrice,
  priceBreakdown,
  isPricingMode,
} from "./marginPricing";

/* Markup ↔ margin ↔ price. All money via round2. Null-safe on every edge. */

describe("the $100 worked examples (spec)", () => {
  it("cost 100 + 25% markup → $125.00", () => {
    expect(computeSellingPrice(100, 25, "markup")).toBe(125);
  });
  it("$125 sell on $100 cost → 20% gross margin", () => {
    expect(equivalentMarginPct(100, 125)).toBe(20);
  });
  it("cost 100 + 25% margin → $133.33", () => {
    expect(computeSellingPrice(100, 25, "margin")).toBe(133.33);
  });
  it("$133.33 sell on $100 cost → ~33.33% markup", () => {
    expect(equivalentMarkupPct(100, 133.33)).toBe(33.33);
  });
  it("round-trip: the 25% margin price reads back as ~25% margin", () => {
    const price = computeSellingPrice(100, 25, "margin")!; // 133.33
    expect(equivalentMarginPct(100, price)).toBeCloseTo(25, 1);
  });
});

describe("computeSellingPrice edge cases (no Infinity/NaN/throw)", () => {
  it("zero cost → 0 in both modes (never NaN)", () => {
    expect(computeSellingPrice(0, 25, "markup")).toBe(0);
    expect(computeSellingPrice(0, 25, "margin")).toBe(0);
  });
  it("missing cost → null", () => {
    expect(computeSellingPrice(null, 25, "markup")).toBeNull();
    expect(computeSellingPrice(undefined, 25, "margin")).toBeNull();
  });
  it("negative cost → null", () => {
    expect(computeSellingPrice(-5, 25, "markup")).toBeNull();
  });
  it("missing pct → null", () => {
    expect(computeSellingPrice(100, null, "markup")).toBeNull();
  });
  it("margin == 100% → null (unreachable)", () => {
    expect(computeSellingPrice(100, 100, "margin")).toBeNull();
  });
  it("margin > 100% → null (negative denominator)", () => {
    expect(computeSellingPrice(100, 150, "margin")).toBeNull();
  });
  it("margin at 99.9% is finite (approaching 100), never Infinity", () => {
    const p = computeSellingPrice(100, 99.9, "margin");
    expect(p).not.toBeNull();
    expect(Number.isFinite(p!)).toBe(true);
  });
  it("negative markup (below-cost / discount) is allowed", () => {
    expect(computeSellingPrice(100, -10, "markup")).toBe(90);
  });
  it("negative margin is allowed (below cost)", () => {
    // price = 100 / (1 - (-25/100)) = 100 / 1.25 = 80
    expect(computeSellingPrice(100, -25, "margin")).toBe(80);
  });
  it("large markup rounds to cents", () => {
    expect(computeSellingPrice(19.99, 300, "markup")).toBe(79.96);
  });
});

describe("equivalent percentages guard divide-by-zero", () => {
  it("markup pct null when cost ≤ 0", () => {
    expect(equivalentMarkupPct(0, 50)).toBeNull();
    expect(equivalentMarkupPct(null, 50)).toBeNull();
  });
  it("margin pct null when price ≤ 0", () => {
    expect(equivalentMarginPct(100, 0)).toBeNull();
    expect(equivalentMarginPct(100, null)).toBeNull();
  });
  it("unitGrossProfit null when either side missing", () => {
    expect(unitGrossProfit(null, 10)).toBeNull();
    expect(unitGrossProfit(10, null)).toBeNull();
    expect(unitGrossProfit(100, 125)).toBe(25);
  });
});

describe("pctFromPrice recovers the control value", () => {
  it("markup mode", () => {
    expect(pctFromPrice(100, 125, "markup")).toBe(25);
  });
  it("margin mode", () => {
    expect(pctFromPrice(100, 125, "margin")).toBe(20);
  });
});

describe("priceBreakdown — full readout, total & null-safe", () => {
  it("valid markup breakdown with quantity", () => {
    const b = priceBreakdown({ cost: 100, pct: 25, mode: "markup", quantity: 3 });
    expect(b.valid).toBe(true);
    expect(b.sellingPrice).toBe(125);
    expect(b.markupPct).toBe(25);
    expect(b.marginPct).toBe(20);
    expect(b.unitGrossProfit).toBe(25);
    expect(b.quantity).toBe(3);
    expect(b.lineTotal).toBe(375);
    expect(b.lineGrossProfit).toBe(75);
    expect(b.belowCost).toBe(false);
  });
  it("missing cost → invalid with reason, no NaN anywhere", () => {
    const b = priceBreakdown({ cost: null, pct: 25, mode: "markup" });
    expect(b.valid).toBe(false);
    expect(b.reason).toBe("missing_cost");
    expect(b.sellingPrice).toBeNull();
    expect(b.lineTotal).toBeNull();
  });
  it("100% margin → invalid with reason margin_ge_100", () => {
    const b = priceBreakdown({ cost: 100, pct: 100, mode: "margin" });
    expect(b.valid).toBe(false);
    expect(b.reason).toBe("margin_ge_100");
  });
  it("below-cost flagged", () => {
    const b = priceBreakdown({ cost: 100, pct: -10, mode: "markup" });
    expect(b.valid).toBe(true);
    expect(b.sellingPrice).toBe(90);
    expect(b.belowCost).toBe(true);
  });
  it("quantity defaults to 1 for zero/negative/blank", () => {
    expect(priceBreakdown({ cost: 100, pct: 25, mode: "markup", quantity: 0 }).quantity).toBe(1);
    expect(priceBreakdown({ cost: 100, pct: 25, mode: "markup", quantity: -4 }).quantity).toBe(1);
    expect(priceBreakdown({ cost: 100, pct: 25, mode: "markup", quantity: null }).quantity).toBe(1);
  });
  it("zero cost is valid (price 0), equivalents null (can't divide)", () => {
    const b = priceBreakdown({ cost: 0, pct: 25, mode: "markup" });
    expect(b.valid).toBe(true);
    expect(b.sellingPrice).toBe(0);
    expect(b.markupPct).toBeNull();
    expect(b.marginPct).toBeNull();
  });
});

describe("isPricingMode", () => {
  it("accepts only markup/margin", () => {
    expect(isPricingMode("markup")).toBe(true);
    expect(isPricingMode("margin")).toBe(true);
    expect(isPricingMode("cost")).toBe(false);
    expect(isPricingMode(null)).toBe(false);
  });
});
