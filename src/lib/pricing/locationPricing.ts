export type BusinessHours = "low" | "medium" | "high" | "24/7";
export type MachinesRequested = 1 | 2 | 3 | 4;

export interface PricingInput {
  employees: number;
  foot_traffic: number;
  business_hours: BusinessHours;
  machines_requested: MachinesRequested;
}

export interface PricingResult {
  total_score: number;
  traffic_score: number;
  hours_score: number;
  machine_score: number;
  tier: 1 | 2 | 3 | 4 | 5;
  tier_label: string;
  price: number;
}

const HOURS_SCORES: Record<BusinessHours, number> = {
  low: 10,
  medium: 20,
  high: 30,
  "24/7": 40,
};

const MACHINE_SCORES: Record<MachinesRequested, number> = {
  1: 8,
  2: 15,
  3: 23,
  4: 30,
};

const TIERS: { min: number; tier: 1 | 2 | 3 | 4 | 5; label: string; price: number }[] = [
  { min: 86, tier: 5, label: "Tier 5", price: 1200 },
  { min: 66, tier: 4, label: "Tier 4", price: 1000 },
  { min: 46, tier: 3, label: "Tier 3", price: 750 },
  { min: 31, tier: 2, label: "Tier 2", price: 500 },
  { min: 0, tier: 1, label: "Tier 1", price: 400 },
];

export function calculateLocationPrice(input: PricingInput): PricingResult {
  if (input.employees < 0) throw new Error("employees must be >= 0");
  if (input.foot_traffic < 0) throw new Error("foot_traffic must be >= 0");

  const hoursScore = HOURS_SCORES[input.business_hours];
  if (hoursScore === undefined) {
    throw new Error(`Invalid business_hours: ${input.business_hours}. Must be one of: low, medium, high, 24/7`);
  }

  const machineScore = MACHINE_SCORES[input.machines_requested];
  if (machineScore === undefined) {
    throw new Error(`Invalid machines_requested: ${input.machines_requested}. Must be 1, 2, 3, or 4`);
  }

  const totalTraffic = input.employees + input.foot_traffic;
  const trafficScore = Math.min((totalTraffic / 500) * 30, 30);

  const rawTotal = trafficScore + hoursScore + machineScore;
  const totalScore = Math.round(Math.min(rawTotal, 100));

  const matched = TIERS.find((t) => totalScore >= t.min)!;

  return {
    total_score: totalScore,
    traffic_score: Math.round(trafficScore * 100) / 100,
    hours_score: hoursScore,
    machine_score: machineScore,
    tier: matched.tier,
    tier_label: matched.label,
    price: matched.price,
  };
}
