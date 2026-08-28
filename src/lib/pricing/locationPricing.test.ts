import { describe, it, expect } from "vitest";
import { calculateLocationPrice, PricingInput } from "./locationPricing";

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
  describe("tier boundaries", () => {
    it("minimum score 18 → Tier 1, $400", () => {
      // Minimum possible score is traffic(0) + hours(10) + machines(8) = 18.
      const result = calculateLocationPrice(make());
      expect(result.total_score).toBe(18);
      expect(result.tier).toBe(1);
      expect(result.price).toBe(400);
    });

    it("score 30 → Tier 1, $400", () => {
      const result = calculateLocationPrice(make({ employees: 100, foot_traffic: 100 }));
      expect(result.total_score).toBe(30);
      expect(result.tier).toBe(1);
      expect(result.price).toBe(400);
    });

    it("score 31 → Tier 2, $500", () => {
      const result = calculateLocationPrice(make({ employees: 100, foot_traffic: 117 }));
      expect(result.total_score).toBe(31);
      expect(result.tier).toBe(2);
      expect(result.price).toBe(500);
    });

    it("score 45 → Tier 2, $500", () => {
      const result = calculateLocationPrice(make({ employees: 200, foot_traffic: 250 }));
      expect(result.total_score).toBe(45);
      expect(result.tier).toBe(2);
      expect(result.price).toBe(500);
    });

    it("score 46 → Tier 3, $750", () => {
      const result = calculateLocationPrice(make({ employees: 200, foot_traffic: 267 }));
      expect(result.total_score).toBe(46);
      expect(result.tier).toBe(3);
      expect(result.price).toBe(750);
    });

    it("score 65 → Tier 3, $750", () => {
      const result = calculateLocationPrice(
        make({ employees: 250, foot_traffic: 250, business_hours: "medium", machines_requested: 2 })
      );
      expect(result.total_score).toBe(65);
      expect(result.tier).toBe(3);
      expect(result.price).toBe(750);
    });

    it("score 66 → Tier 4, $1000", () => {
      const result = calculateLocationPrice(
        make({ employees: 200, foot_traffic: 267, business_hours: "high" })
      );
      expect(result.total_score).toBe(66);
      expect(result.tier).toBe(4);
      expect(result.price).toBe(1000);
    });

    it("score 85 → Tier 4, $1000", () => {
      const result = calculateLocationPrice(
        make({ employees: 250, foot_traffic: 250, business_hours: "24/7", machines_requested: 2 })
      );
      expect(result.total_score).toBe(85);
      expect(result.tier).toBe(4);
      expect(result.price).toBe(1000);
    });

    it("score 86 → Tier 5, $1200", () => {
      const result = calculateLocationPrice(
        make({ employees: 200, foot_traffic: 234, business_hours: "high", machines_requested: 4 })
      );
      expect(result.total_score).toBe(86);
      expect(result.tier).toBe(5);
      expect(result.price).toBe(1200);
    });

    it("score 100 (capped) → Tier 5, $1200", () => {
      const result = calculateLocationPrice(
        make({ employees: 5000, foot_traffic: 5000, business_hours: "24/7", machines_requested: 4 })
      );
      expect(result.total_score).toBe(100);
      expect(result.tier).toBe(5);
      expect(result.price).toBe(1200);
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
        make({ employees: 5000, foot_traffic: 5000, business_hours: "24/7", machines_requested: 4 })
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
        calculateLocationPrice(make({ business_hours: "invalid" as never }))
      ).toThrow("Invalid business_hours");
    });

    it("throws on invalid machines_requested", () => {
      expect(() =>
        calculateLocationPrice(make({ machines_requested: 5 as never }))
      ).toThrow("Invalid machines_requested");
    });
  });

  describe("output shape", () => {
    it("returns all expected fields", () => {
      const result = calculateLocationPrice(make({ employees: 100, foot_traffic: 200, business_hours: "high", machines_requested: 2 }));
      expect(result).toHaveProperty("total_score");
      expect(result).toHaveProperty("traffic_score");
      expect(result).toHaveProperty("hours_score");
      expect(result).toHaveProperty("machine_score");
      expect(result).toHaveProperty("tier");
      expect(result).toHaveProperty("tier_label");
      expect(result).toHaveProperty("price");
      expect(typeof result.total_score).toBe("number");
      expect(typeof result.price).toBe("number");
      expect(result.tier_label).toMatch(/^Tier [1-5]$/);
    });
  });
});
