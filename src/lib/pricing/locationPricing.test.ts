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
    it("score 0 → Tier 1, $400", () => {
      // employees=0, foot_traffic=0 → traffic=0, hours=low(5), machines=1(3) → total=8
      // To get score 0 we need traffic=0, hours=low(5), machines=1(3) → 8, not 0
      // Minimum possible score is 5+3=8 → Tier 1
      const result = calculateLocationPrice(make());
      expect(result.total_score).toBe(8);
      expect(result.tier).toBe(1);
      expect(result.price).toBe(400);
    });

    it("score 30 → Tier 1, $400", () => {
      // Need traffic_score + 5 + 3 = 30 → traffic_score = 22
      // traffic_score = (total_traffic / 500) * 70 = 22 → total_traffic = 22*500/70 ≈ 157.14
      const result = calculateLocationPrice(make({ employees: 100, foot_traffic: 57 }));
      // (157/500)*70 = 21.98, + 5 + 3 = 29.98, round = 30
      expect(result.total_score).toBe(30);
      expect(result.tier).toBe(1);
      expect(result.price).toBe(400);
    });

    it("score 31 → Tier 2, $500", () => {
      // Need traffic_score + 5 + 3 = 31 → traffic_score = 23
      // total_traffic = 23*500/70 ≈ 164.28
      const result = calculateLocationPrice(make({ employees: 100, foot_traffic: 64 }));
      // (164/500)*70 = 22.96, + 5 + 3 = 30.96, round = 31
      expect(result.total_score).toBe(31);
      expect(result.tier).toBe(2);
      expect(result.price).toBe(500);
    });

    it("score 45 → Tier 2, $500", () => {
      // traffic_score + 5 + 3 = 45 → traffic_score = 37
      // total_traffic = 37*500/70 ≈ 264.28
      const result = calculateLocationPrice(make({ employees: 200, foot_traffic: 64 }));
      // (264/500)*70 = 36.96, + 5 + 3 = 44.96, round = 45
      expect(result.total_score).toBe(45);
      expect(result.tier).toBe(2);
      expect(result.price).toBe(500);
    });

    it("score 46 → Tier 3, $750", () => {
      // traffic_score + 5 + 3 = 46 → traffic_score = 38
      // total_traffic = 38*500/70 ≈ 271.43
      const result = calculateLocationPrice(make({ employees: 200, foot_traffic: 71 }));
      // (271/500)*70 = 37.94, + 5 + 3 = 45.94, round = 46
      expect(result.total_score).toBe(46);
      expect(result.tier).toBe(3);
      expect(result.price).toBe(750);
    });

    it("score 65 → Tier 3, $750", () => {
      // traffic_score + 5 + 3 = 65 → traffic_score = 57
      // total_traffic = 57*500/70 ≈ 407.14
      const result = calculateLocationPrice(make({ employees: 350, foot_traffic: 57 }));
      // (407/500)*70 = 56.98, + 5 + 3 = 64.98, round = 65
      expect(result.total_score).toBe(65);
      expect(result.tier).toBe(3);
      expect(result.price).toBe(750);
    });

    it("score 66 → Tier 4, $1000", () => {
      // traffic_score + 5 + 3 = 66 → traffic_score ≈ 58
      // total_traffic = 58*500/70 ≈ 414.29
      const result = calculateLocationPrice(make({ employees: 350, foot_traffic: 64 }));
      // (414/500)*70 = 57.96, + 5 + 3 = 65.96, round = 66
      expect(result.total_score).toBe(66);
      expect(result.tier).toBe(4);
      expect(result.price).toBe(1000);
    });

    it("score 85 → Tier 4, $1000", () => {
      // traffic_score + 5 + 3 = 85 → traffic_score = 70 (cap) + 5 + 3 = 78, not 85
      // Use higher hours/machines: traffic(70) + high(15) + 1(3) = 88 ≠ 85
      // traffic + medium(10) + 4(10) = traffic + 20. Need traffic = 65
      // total_traffic = 65*500/70 ≈ 464.29
      const result = calculateLocationPrice(
        make({ employees: 400, foot_traffic: 64, business_hours: "medium", machines_requested: 4 })
      );
      // (464/500)*70 = 64.96, + 10 + 10 = 84.96, round = 85
      expect(result.total_score).toBe(85);
      expect(result.tier).toBe(4);
      expect(result.price).toBe(1000);
    });

    it("score 86 → Tier 5, $1200", () => {
      // traffic + medium(10) + 4(10) = traffic + 20. Need traffic = 66
      // total_traffic = 66*500/70 ≈ 471.43
      const result = calculateLocationPrice(
        make({ employees: 400, foot_traffic: 71, business_hours: "medium", machines_requested: 4 })
      );
      // (471/500)*70 = 65.94, + 10 + 10 = 85.94, round = 86
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
    it("low → 5", () => {
      const result = calculateLocationPrice(make({ business_hours: "low" }));
      expect(result.hours_score).toBe(5);
    });

    it("medium → 10", () => {
      const result = calculateLocationPrice(make({ business_hours: "medium" }));
      expect(result.hours_score).toBe(10);
    });

    it("high → 15", () => {
      const result = calculateLocationPrice(make({ business_hours: "high" }));
      expect(result.hours_score).toBe(15);
    });

    it("24/7 → 20", () => {
      const result = calculateLocationPrice(make({ business_hours: "24/7" }));
      expect(result.hours_score).toBe(20);
    });
  });

  describe("machines_requested scoring", () => {
    it("1 → 3", () => {
      const result = calculateLocationPrice(make({ machines_requested: 1 }));
      expect(result.machine_score).toBe(3);
    });

    it("2 → 6", () => {
      const result = calculateLocationPrice(make({ machines_requested: 2 }));
      expect(result.machine_score).toBe(6);
    });

    it("3 → 8", () => {
      const result = calculateLocationPrice(make({ machines_requested: 3 }));
      expect(result.machine_score).toBe(8);
    });

    it("4 → 10", () => {
      const result = calculateLocationPrice(make({ machines_requested: 4 }));
      expect(result.machine_score).toBe(10);
    });
  });

  describe("traffic score cap at 70", () => {
    it("caps traffic_score at 70 for very high traffic", () => {
      const result = calculateLocationPrice(make({ employees: 1000, foot_traffic: 1000 }));
      expect(result.traffic_score).toBe(70);
    });
  });

  describe("total score cap at 100", () => {
    it("caps total_score at 100", () => {
      const result = calculateLocationPrice(
        make({ employees: 5000, foot_traffic: 5000, business_hours: "24/7", machines_requested: 4 })
      );
      // traffic(70) + hours(20) + machine(10) = 100
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
