import { z } from "zod";

/**
 * What Vinnie may learn about the prospective operator during discovery.
 * No SSN, bank, card, income figure, or date of birth is accepted here.
 * A credit score (or the financing form's credit range) is a permitted
 * planning input; when only the score is given the range is derived.
 */
export const CREDIT_RANGES = ["Below 600", "600–649", "650–699", "700–749", "750+"] as const;
export type CreditRange = (typeof CREDIT_RANGES)[number];

const shortText = (max: number) => z.string().trim().min(1).max(max);
const money = (max: number) => z.number().min(0).max(max);

export const operatorProfileSchema = z
  .object({
    operator_type: z.enum(["new", "existing"]).nullable(),
    business_name: shortText(120).nullable(),
    territory: shortText(160).nullable(),
    service_radius_miles: z.number().min(0).max(1000).nullable(),
    vending_experience: shortText(240).nullable(),
    weekly_hours_available: z.number().min(0).max(168).nullable(),
    staffing: z.enum(["owner_operated", "staffed"]).nullable(),
    has_vehicle: z.boolean().nullable(),
    has_storage: z.boolean().nullable(),
    desired_launch: shortText(60).nullable(),
    /** Monthly cash-flow goal from the machines (a goal, never actual income). */
    monthly_cash_flow_goal: money(1_000_000).nullable(),
    cash_available: money(10_000_000).nullable(),
    financing_interest: z.boolean().nullable(),
    credit_range: z.enum(CREDIT_RANGES).nullable(),
    /** Approximate credit score as the customer states it (300–850). */
    credit_score: z.number().int().min(300).max(850).nullable(),
    target_machine_count: z.number().int().min(1).max(200).nullable(),
    /** Fraction of machine contribution the customer expects to pay locations (usually 0). */
    expected_location_fee_rate: z.number().min(0).max(0.5).nullable(),
    existing_machine_count: z.number().int().min(0).max(1000).nullable(),
    existing_monthly_sales: money(10_000_000).nullable(),
  })
  .strict();

export type OperatorProfile = z.infer<typeof operatorProfileSchema>;

export const EMPTY_PROFILE: Readonly<OperatorProfile> = Object.freeze({
  operator_type: null,
  business_name: null,
  territory: null,
  service_radius_miles: null,
  vending_experience: null,
  weekly_hours_available: null,
  staffing: null,
  has_vehicle: null,
  has_storage: null,
  desired_launch: null,
  monthly_cash_flow_goal: null,
  cash_available: null,
  financing_interest: null,
  credit_range: null,
  credit_score: null,
  target_machine_count: null,
  expected_location_fee_rate: null,
  existing_machine_count: null,
  existing_monthly_sales: null,
});

export const PROFILE_KEYS = Object.keys(EMPTY_PROFILE) as Array<keyof OperatorProfile>;

/** The financing form's range for a numeric score. */
export function creditRangeFromScore(score: number): CreditRange {
  if (score < 600) return "Below 600";
  if (score < 650) return "600–649";
  if (score < 700) return "650–699";
  if (score < 750) return "700–749";
  return "750+";
}

/** Merge non-null patch values over an existing profile; nulls leave fields untouched. */
export function mergeProfile(base: OperatorProfile, patch: Partial<OperatorProfile> | null | undefined): OperatorProfile {
  const out: OperatorProfile = { ...base };
  if (!patch) return out;
  for (const key of PROFILE_KEYS) {
    const v = patch[key];
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  if (typeof patch.credit_score === "number" && (patch.credit_range === null || patch.credit_range === undefined)) out.credit_range = creditRangeFromScore(patch.credit_score);
  return out;
}

/** Discovery fields Vinnie should still ask about, in a sensible order (one to three per turn). */
export const DISCOVERY_ORDER: Array<keyof OperatorProfile> = [
  "operator_type",
  "vending_experience",
  "territory",
  "weekly_hours_available",
  "staffing",
  "has_vehicle",
  "has_storage",
  "desired_launch",
  "monthly_cash_flow_goal",
  "cash_available",
  "financing_interest",
  "target_machine_count",
  "expected_location_fee_rate",
];

export function missingDiscovery(profile: OperatorProfile): Array<keyof OperatorProfile> {
  const missing = DISCOVERY_ORDER.filter((k) => profile[k] === null);
  if (profile.operator_type === "existing" && profile.existing_machine_count === null) missing.push("existing_machine_count");
  return missing;
}
