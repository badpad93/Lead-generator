export interface ScoringInput {
  services_needed?: string[];
  budget_range?: string;
  timeline?: string;
  is_decision_maker?: boolean;
  has_vending_currently?: boolean;
  num_locations_needed?: number;
  years_in_business?: string;
  annual_revenue?: string;
  referral_source?: string;
  num_employees?: string;
  pain_points?: string;
}

export interface DealScores {
  intent_score: number;
  budget_score: number;
  readiness_score: number;
  upsell_score: number;
  deal_quality_score: number;
}

const BUDGET_MAP: Record<string, number> = {
  under_5k: 15,
  "5k_15k": 40,
  "15k_30k": 60,
  "30k_50k": 80,
  "50k_plus": 100,
};

const TIMELINE_INTENT: Record<string, number> = {
  immediately: 30,
  "1_2_weeks": 25,
  "1_month": 18,
  "1_3_months": 10,
  "no_rush": 5,
  exploring: 2,
};

const REVENUE_SCORE: Record<string, number> = {
  under_100k: 5,
  "100k_500k": 15,
  "500k_1m": 25,
  "1m_5m": 35,
  "5m_plus": 45,
};

const HIGH_VALUE_SERVICES = ["financing", "location", "machine", "total_operator_package"];

export function scoreDeal(input: ScoringInput): DealScores {
  let intent = 0;
  let budget = 0;
  let readiness = 0;
  let upsell = 0;

  // --- Intent Score (0-100) ---
  const services = input.services_needed || [];
  intent += Math.min(services.length * 12, 36);
  intent += TIMELINE_INTENT[input.timeline || "exploring"] || 2;
  if (input.is_decision_maker) intent += 15;
  if (input.has_vending_currently) intent += 8;
  if (input.pain_points && input.pain_points.length > 20) intent += 10;
  if (input.referral_source === "referral" || input.referral_source === "partner") intent += 12;
  if (services.some((s) => HIGH_VALUE_SERVICES.includes(s))) intent += 10;
  intent = Math.min(100, intent);

  // --- Budget Score (0-100) ---
  budget = BUDGET_MAP[input.budget_range || ""] || 10;
  if (input.annual_revenue) {
    budget = Math.min(100, budget + (REVENUE_SCORE[input.annual_revenue] || 0));
  }
  if ((input.num_locations_needed || 0) >= 5) budget += 15;
  budget = Math.min(100, budget);

  // --- Readiness Score (0-100) ---
  if (input.is_decision_maker) readiness += 30;
  if (input.timeline === "immediately" || input.timeline === "1_2_weeks") readiness += 30;
  else if (input.timeline === "1_month") readiness += 20;
  else readiness += 5;
  if (input.has_vending_currently) readiness += 10;
  if (input.years_in_business && input.years_in_business !== "startup") readiness += 15;
  if (services.length > 0) readiness += 15;
  readiness = Math.min(100, readiness);

  // --- Upsell Score (0-100) ---
  upsell += Math.min(services.length * 10, 30);
  if (!services.includes("digital") && services.includes("location")) upsell += 15;
  if (!services.includes("financing") && budget >= 60) upsell += 15;
  if (!services.includes("coffee") && services.includes("machine")) upsell += 10;
  if ((input.num_locations_needed || 0) >= 3) upsell += 15;
  if (input.num_employees === "50_plus" || input.num_employees === "100_plus") upsell += 15;
  upsell = Math.min(100, upsell);

  // --- Total Quality Score (weighted average) ---
  const deal_quality_score = Math.round(
    intent * 0.3 + budget * 0.25 + readiness * 0.25 + upsell * 0.2
  );

  return {
    intent_score: Math.round(intent),
    budget_score: Math.round(budget),
    readiness_score: Math.round(readiness),
    upsell_score: Math.round(upsell),
    deal_quality_score,
  };
}

export function getScoreLabel(score: number): string {
  if (score >= 80) return "Hot";
  if (score >= 60) return "Warm";
  if (score >= 40) return "Moderate";
  if (score >= 20) return "Cool";
  return "Cold";
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-red-600";
  if (score >= 60) return "text-orange-500";
  if (score >= 40) return "text-yellow-600";
  if (score >= 20) return "text-blue-500";
  return "text-gray-400";
}
