import { describe, it, expect } from "vitest";
import {
  calculateLocationPrice,
  TIER_PRICES,
  TEN_TEN_TEN_PRICE,
  DEFAULT_LOCATION_PRICE,
  PricingInput,
} from "./locationPricing";

function make(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    employees: 0,
    foot_traffic: 0,
    business_hours: "low",
    machines_requested: 1,
    ...overrides,
  };
}

describe("calculateLocationPrice", () => {
  describe("tier ladder ($500 / $800 / $1200)", () => {
    it("baseline low inputs → Basic", () => {
      // hours low=10, machines 1=8, traffic=0 → total 18 → Basic
      const r = calculateLocationPrice(make());
      expect(r.total_score).toBe(18);
      expect(r.tier).toBe(1);
      expect(r.tier_label).toBe("Basic");
      expect(r.price).toBe(500);
    });

    it("just below the Premium threshold stays Basic", () => {
      // hours high=30, machines 3=23, traffic 6 → 59 → Basic
      const r = calculateLocationPrice(
        make({ business_hours: "high", machines_requested: 3, employees: 50, foot_traffic: 50 }),
      );
      // traffic = (100/500)*30 = 6 → total = 6+30+23 = 59
      expect(r.total_score).toBe(59);
      expect(r.tier).toBe(1);
      expect(r.price).toBe(500);
    });

    it("score 60 → Premium", () => {
      // hours 24/7=40, machines 2=15, traffic ~5 → total 60
      const r = calculateLocationPrice(
        make({ business_hours: "24/7", machines_requested: 2, employees: 50, foot_traffic: 33 }),
      );
      // traffic = (83/500)*30 = 4.98, +40+15 = 59.98 → round 60
      expect(r.total_score).toBe(60);
      expect(r.tier).toBe(2);
      expect(r.tier_label).toBe("Premium");
      expect(r.price).toBe(800);
    });

    it("score 89 → Premium", () => {
      // hours 24/7=40, machines 4=30, traffic 19 → total 89
      const r = calculateLocationPrice(
        make({ business_hours: "24/7", machines_requested: 4, employees: 200, foot_traffic: 116 }),
      );
      // traffic = (316/500)*30 = 18.96, +40+30 = 88.96 → round 89
      expect(r.total_score).toBe(89);
      expect(r.tier).toBe(2);
      expect(r.price).toBe(800);
    });

    it("score 90 → Elite", () => {
      // Bump traffic just above the boundary
      const r = calculateLocationPrice(
        make({ business_hours: "24/7", machines_requested: 4, employees: 200, foot_traffic: 133 }),
      );
      // traffic = (333/500)*30 = 19.98, +40+30 = 89.98 → round 90
      expect(r.total_score).toBe(90);
      expect(r.tier).toBe(3);
      expect(r.tier_label).toBe("Elite");
      expect(r.price).toBe(1200);
    });

    it("score 100 (capped) → Elite", () => {
      const r = calculateLocationPrice(
        make({ employees: 5000, foot_traffic: 5000, business_hours: "24/7", machines_requested: 4 }),
      );
      expect(r.total_score).toBe(100);
      expect(r.tier).toBe(3);
      expect(r.price).toBe(1200);
    });
  });

  describe("10/10/10 prepaid override", () => {
    it("forces price to $400 regardless of score", () => {
      const eliteInput = make({
        employees: 5000,
        foot_traffic: 5000,
        business_hours: "24/7",
        machines_requested: 4,
        is_ten_ten_ten: true,
      });
      const r = calculateLocationPrice(eliteInput);
      expect(r.price).toBe(400);
      expect(r.is_ten_ten_ten).toBe(true);
      expect(r.tier_label).toBe("10/10/10 Prepaid");
      // Tier still reflects the underlying score so ops reporting stays truthful
      expect(r.tier).toBe(3);
    });

    it("also overrides on the low-score end", () => {
      const r = calculateLocationPrice(make({ is_ten_ten_ten: true }));
      expect(r.price).toBe(400);
      expect(r.is_ten_ten_ten).toBe(true);
    });

    it("undefined and false both behave as false", () => {
      const noFlag = calculateLocationPrice(make());
      const explicitFalse = calculateLocationPrice(make({ is_ten_ten_ten: false }));
      expect(noFlag.price).toBe(500);
      expect(noFlag.is_ten_ten_ten).toBe(false);
      expect(explicitFalse.price).toBe(500);
      expect(explicitFalse.is_ten_ten_ten).toBe(false);
    });
  });

  describe("shared constants", () => {
    it("TIER_PRICES matches the ladder", () => {
      expect(TIER_PRICES[1]).toBe(500);
      expect(TIER_PRICES[2]).toBe(800);
      expect(TIER_PRICES[3]).toBe(1200);
    });
    it("TEN_TEN_TEN_PRICE = 400", () => {
      expect(TEN_TEN_TEN_PRICE).toBe(400);
    });
    it("DEFAULT_LOCATION_PRICE = Tier1", () => {
      expect(DEFAULT_LOCATION_PRICE).toBe(500);
    });
  });

  describe("business_hours scoring", () => {
    it("low → 10", () => {
      const result = calculateLocationPrice(make({ business_hours: "low" }));
      expect(result.hours_score).toBe(10);
    });
    it("medium → 20", () => {
      const result = calculateLocationPrice(make({ business_hours: "medium" }));
      expect(result.hours_score).toBe(20);
    });
    it("high → 30", () => {
      const result = calculateLocationPrice(make({ business_hours: "high" }));
      expect(result.hours_score).toBe(30);
    });
    it("24/7 → 40", () => {
      const result = calculateLocationPrice(make({ business_hours: "24/7" }));
      expect(result.hours_score).toBe(40);
    });
  });

  describe("machines_requested scoring", () => {
    it("1 → 8", () => {
      const result = calculateLocationPrice(make({ machines_requested: 1 }));
      expect(result.machine_score).toBe(8);
    });
    it("2 → 15", () => {
      const result = calculateLocationPrice(make({ machines_requested: 2 }));
      expect(result.machine_score).toBe(15);
    });
    it("3 → 23", () => {
      const result = calculateLocationPrice(make({ machines_requested: 3 }));
      expect(result.machine_score).toBe(23);
    });
    it("4 → 30", () => {
      const result = calculateLocationPrice(make({ machines_requested: 4 }));
      expect(result.machine_score).toBe(30);
    });
  });

  describe("traffic score cap at 30", () => {
    it("caps traffic_score at 30 for very high traffic", () => {
      const result = calculateLocationPrice(make({ employees: 1000, foot_traffic: 1000 }));
      expect(result.traffic_score).toBe(30);
    });
  });

  describe("total score cap at 100", () => {
    it("caps total_score at 100", () => {
      const result = calculateLocationPrice(
        make({ employees: 5000, foot_traffic: 5000, business_hours: "24/7", machines_requested: 4 }),
      );
      // traffic(30) + hours(40) + machine(30) = 100
      expect(result.total_score).toBe(100);
    });
  });

  describe("input validation", () => {
    it("throws on negative employees", () => {
      expect(() => calculateLocationPrice(make({ employees: -1 }))).toThrow("employees must be >= 0");
    });
    it("throws on negative foot_traffic", () => {
      expect(() => calculateLocationPrice(make({ foot_traffic: -5 }))).toThrow("foot_traffic must be >= 0");
    });
    it("throws on invalid business_hours", () => {
      expect(() =>
        calculateLocationPrice(make({ business_hours: "invalid" as never })),
      ).toThrow("Invalid business_hours");
    });
    it("throws on invalid machines_requested", () => {
      expect(() =>
        calculateLocationPrice(make({ machines_requested: 5 as never })),
      ).toThrow("Invalid machines_requested");
    });
  });
});
