import { describe, expect, it } from "vitest";
import { computePricingResult, DEFAULT_MAX_MARGIN_CENTS } from "./pricingRules";

describe("computePricingResult (final_vc_price >= wholesale, margin cap $300)", () => {
  it("returns ok when both prices are null (draft state)", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: null,
      final_price_cents: null,
    });
    expect(r).toEqual({ ok: true });
  });

  it("returns ok when only wholesale is set (partial draft)", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: 300000,
      final_price_cents: null,
    });
    expect(r).toEqual({ ok: true });
  });

  it("rejects when final is set but wholesale is missing", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: null,
      final_price_cents: 400000,
    });
    expect(r?.ok).toBe(false);
    expect(r?.code).toBe("wholesale_missing");
  });

  it("rejects final < wholesale (final_below_wholesale)", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: 400000,
      final_price_cents: 300000,
    });
    expect(r?.ok).toBe(false);
    expect(r?.code).toBe("final_below_wholesale");
  });

  it("returns ok when final equals wholesale (zero margin)", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: 350000,
      final_price_cents: 350000,
    });
    expect(r?.ok).toBe(true);
    expect(r?.margin_cents).toBe(0);
  });

  it("returns ok when margin is exactly the cap ($300)", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: 350000,
      final_price_cents: 350000 + DEFAULT_MAX_MARGIN_CENTS,
    });
    expect(r?.ok).toBe(true);
    expect(r?.margin_cents).toBe(DEFAULT_MAX_MARGIN_CENTS);
  });

  it("rejects margin over $300 when listing_id is null (create path)", () => {
    const r = computePricingResult({
      listing_id: null,
      wholesale_price_cents: 350000,
      final_price_cents: 350000 + DEFAULT_MAX_MARGIN_CENTS + 100,
    });
    expect(r?.ok).toBe(false);
    expect(r?.code).toBe("margin_over_cap_needs_exception");
    expect(r?.margin_cents).toBe(DEFAULT_MAX_MARGIN_CENTS + 100);
  });

  it("defers to DB (returns null) when margin > cap AND listing_id present", () => {
    const r = computePricingResult({
      listing_id: "some-listing-uuid",
      wholesale_price_cents: 350000,
      final_price_cents: 500000,
    });
    // null means "caller needs to check for an approved exception"
    expect(r).toBeNull();
  });

  it("DEFAULT_MAX_MARGIN_CENTS matches the brief ($300)", () => {
    expect(DEFAULT_MAX_MARGIN_CENTS).toBe(30000);
  });
});
