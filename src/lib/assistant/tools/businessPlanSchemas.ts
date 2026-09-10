import { z } from "zod";
import { ASSUMPTION_BOUNDS, ASSUMPTION_LABELS, DEFAULT_ASSUMPTIONS, PACKAGE_KEYS, type Assumptions } from "@/lib/businessPlan/assumptions";
import { CREDIT_RANGES, operatorProfileSchema } from "@/lib/businessPlan/profile";
import type { JsonSchemaObject } from "./schemas";

/**
 * Business-plan tool contracts (strict JSON Schema for OpenAI, Zod for the
 * server). No input accepts a price, total, catalog id, QuickBooks id,
 * URL, credit score, income figure, date of birth, or bank/card detail:
 * only the discovery answers, the approved assumption overrides, the
 * package choice, and plan references.
 */
export const BUSINESS_PLAN_TOOL_NAMES = [
  "calculate_vending_business_plan",
  "recommend_vending_package",
  "start_vending_business_plan",
  "update_vending_business_plan",
  "get_vending_business_plan",
  "create_quote_from_business_plan",
  "get_business_plan_exports",
  "start_financing_application",
] as const;
export type BusinessPlanToolName = (typeof BUSINESS_PLAN_TOOL_NAMES)[number];

const ASSUMPTION_KEYS = Object.keys(DEFAULT_ASSUMPTIONS) as Array<keyof Assumptions>;

const assumptionOverridesZod = z
  .object(Object.fromEntries(ASSUMPTION_KEYS.map((k) => [k, z.number().min(ASSUMPTION_BOUNDS[k][0]).max(ASSUMPTION_BOUNDS[k][1]).nullable()])) as Record<keyof Assumptions, z.ZodNullable<z.ZodNumber>>)
  .strict();

const rolloutZod = z.object({ machines_per_month: z.number().int().min(1).max(20).nullable(), first_month_share: z.number().min(0).max(1).nullable(), second_month_share: z.number().min(0).max(1).nullable() }).strict();

const packageZod = z.enum(PACKAGE_KEYS as unknown as [string, ...string[]]).nullable();
const financingCaseZod = z.enum(["sba", "alternative"]).nullable();
const planId = z.string().uuid().nullable();

/** Shared by calculate and start: everything needed to build a plan from scratch. */
const planSpecZod = {
  package: packageZod,
  operator: operatorProfileSchema.nullable(),
  assumptions: assumptionOverridesZod.nullable(),
  rollout: rolloutZod.nullable(),
  website_included: z.boolean().nullable(),
  financing_case: financingCaseZod,
  cash_contribution: z.number().min(0).max(10_000_000).nullable(),
};

export const calculateBusinessPlanInput = z.object(planSpecZod).strict();
export const startBusinessPlanInput = z.object(planSpecZod).strict();
export const updateBusinessPlanInput = z
  .object({
    plan_id: planId,
    changes: z.object({ ...planSpecZod, confirmed: z.boolean().nullable(), reset_assumptions: z.array(z.enum(ASSUMPTION_KEYS as unknown as [string, ...string[]])).max(20).nullable() }).strict(),
  })
  .strict();
export const getBusinessPlanInput = z.object({ plan_id: planId }).strict();
export const recommendPackageInput = z.object({ operator: operatorProfileSchema }).strict();
export const createQuoteFromPlanInput = z.object({ plan_id: planId, confirm: z.boolean() }).strict();
export const getPlanExportsInput = z.object({ plan_id: planId }).strict();
export const startFinancingApplicationInput = z.object({ plan_id: planId }).strict();

export const BUSINESS_PLAN_ZOD_SCHEMAS = {
  calculate_vending_business_plan: calculateBusinessPlanInput,
  recommend_vending_package: recommendPackageInput,
  start_vending_business_plan: startBusinessPlanInput,
  update_vending_business_plan: updateBusinessPlanInput,
  get_vending_business_plan: getBusinessPlanInput,
  create_quote_from_business_plan: createQuoteFromPlanInput,
  get_business_plan_exports: getPlanExportsInput,
  start_financing_application: startFinancingApplicationInput,
} as const;

export type CalculateBusinessPlanInput = z.infer<typeof calculateBusinessPlanInput>;
export type UpdateBusinessPlanInput = z.infer<typeof updateBusinessPlanInput>;
export type GetBusinessPlanInput = z.infer<typeof getBusinessPlanInput>;
export type RecommendPackageInput = z.infer<typeof recommendPackageInput>;
export type CreateQuoteFromPlanInput = z.infer<typeof createQuoteFromPlanInput>;
export type PlanSpecInput = z.infer<typeof calculateBusinessPlanInput>;

// ─── JSON Schema (strict) ────────────────────────────────────────────

type Prop = Record<string, unknown>;
const nullable = (type: string, extra: Prop = {}): Prop => ({ type: [type, "null"], ...extra });
const obj = (properties: Record<string, Prop>, description?: string): JsonSchemaObject & { description?: string } => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false, ...(description ? { description } : {}) });
const nullableObj = (schema: JsonSchemaObject, description: string): Prop => ({ anyOf: [schema, { type: "null" }], description });

const OPERATOR_PROPS: Record<string, Prop> = {
  operator_type: nullable("string", { enum: ["new", "existing"], description: "new operator or existing operator." }),
  business_name: nullable("string", { description: "Business name if the customer has one." }),
  territory: nullable("string", { description: "Planned territory (city/region) in the customer's words." }),
  service_radius_miles: nullable("number", { minimum: 0, maximum: 1000, description: "Service radius in miles." }),
  vending_experience: nullable("string", { description: "Vending experience in a short phrase." }),
  weekly_hours_available: nullable("number", { minimum: 0, maximum: 168, description: "Hours per week available for the business." }),
  staffing: nullable("string", { enum: ["owner_operated", "staffed"], description: "Owner-operated or staffed." }),
  has_vehicle: nullable("boolean", { description: "Whether a suitable vehicle is available." }),
  has_storage: nullable("boolean", { description: "Whether product storage is available." }),
  desired_launch: nullable("string", { description: "Desired launch timing in the customer's words (e.g. 'March 2027')." }),
  monthly_cash_flow_goal: nullable("number", { minimum: 0, maximum: 1000000, description: "Monthly cash-flow GOAL from the machines in USD (a target, never actual income)." }),
  cash_available: nullable("number", { minimum: 0, maximum: 10000000, description: "Cash the customer says is available to put toward the launch, in USD." }),
  financing_interest: nullable("boolean", { description: "Whether the customer is interested in financing." }),
  credit_range: nullable("string", { enum: [...CREDIT_RANGES], description: "Approximate credit RANGE only, using exactly these options from the financing form. Never a score." }),
  target_machine_count: nullable("integer", { minimum: 1, maximum: 200, description: "How many machines the customer wants." }),
  expected_location_fee_rate: nullable("number", { minimum: 0, maximum: 0.5, description: "Expected location commission as a fraction of machine contribution (usually 0)." }),
  existing_machine_count: nullable("integer", { minimum: 0, maximum: 1000, description: "Existing operators: machines already in service." }),
  existing_monthly_sales: nullable("number", { minimum: 0, maximum: 10000000, description: "Existing operators: current total monthly sales across existing machines, in USD." }),
};
const OPERATOR_SCHEMA = obj(OPERATOR_PROPS, "Discovery answers. Send only what the customer actually said; leave everything else null.");

const ASSUMPTION_PROPS: Record<string, Prop> = Object.fromEntries(ASSUMPTION_KEYS.map((k) => [k, nullable("number", { minimum: ASSUMPTION_BOUNDS[k][0], maximum: ASSUMPTION_BOUNDS[k][1], description: `${ASSUMPTION_LABELS[k]} (default ${DEFAULT_ASSUMPTIONS[k]}${k.endsWith("_rate") || k === "debit_share" ? ", a fraction" : ", USD"}). Null keeps the Vending Connector default.` })]));
const ASSUMPTION_SCHEMA = obj(ASSUMPTION_PROPS, "Customer-supplied overrides only. Null keeps the approved default.");

const ROLLOUT_SCHEMA = obj({
  machines_per_month: nullable("integer", { minimum: 1, maximum: 20, description: "Machines placed per month (default 2)." }),
  first_month_share: nullable("number", { minimum: 0, maximum: 1, description: "Share of stabilized sales in a machine's first active month (default 0.6)." }),
  second_month_share: nullable("number", { minimum: 0, maximum: 1, description: "Share in the second active month (default 0.8); the third month onward is 1.0." }),
}, "Rollout overrides; null keeps the default two-per-month, 60/80/100% ramp.");

const PLAN_SPEC_PROPS: Record<string, Prop> = {
  package: nullable("string", { enum: [...PACKAGE_KEYS], description: "Package to model: ten_ten_ten (lead with this), five_machine, or single_machine. Null means ten_ten_ten." }),
  operator: nullableObj(OPERATOR_SCHEMA, "Discovery answers gathered so far, or null."),
  assumptions: nullableObj(ASSUMPTION_SCHEMA, "Assumption overrides the customer supplied, or null for all defaults."),
  rollout: nullableObj(ROLLOUT_SCHEMA, "Rollout overrides, or null for the default ramp."),
  website_included: nullable("boolean", { description: "false only when the customer affirmatively declined the website. Null or true includes it." }),
  financing_case: nullable("string", { enum: ["sba", "alternative"], description: "Which illustrative financing case drives debt service in the projections (default sba)." }),
  cash_contribution: nullable("number", { minimum: 0, maximum: 10000000, description: "Cash the customer will put toward the uses of funds, reducing the financing request (default 0)." }),
};

const PLAN_ID_PROP = nullable("string", { description: "The plan_id returned earlier, or null for the customer's most recent plan." });

export const BUSINESS_PLAN_JSON_SCHEMAS: Record<BusinessPlanToolName, JsonSchemaObject> = {
  calculate_vending_business_plan: obj(PLAN_SPEC_PROPS),
  recommend_vending_package: obj({ operator: OPERATOR_SCHEMA }),
  start_vending_business_plan: obj(PLAN_SPEC_PROPS),
  update_vending_business_plan: obj({
    plan_id: PLAN_ID_PROP,
    changes: obj({
      ...PLAN_SPEC_PROPS,
      confirmed: nullable("boolean", { description: "true once the customer has reviewed the assumption summary and confirmed it as the basis for the final plan." }),
      reset_assumptions: { anyOf: [{ type: "array", items: { type: "string", enum: [...ASSUMPTION_KEYS] }, maxItems: 20 }, { type: "null" }], description: "Assumption keys to return to the Vending Connector default." },
    }, "Only the fields being changed; null fields are left as they are."),
  }),
  get_vending_business_plan: obj({ plan_id: PLAN_ID_PROP }),
  create_quote_from_business_plan: obj({
    plan_id: PLAN_ID_PROP,
    confirm: { type: "boolean", description: "false returns a preview only. true creates or updates the quote and must be sent only after the customer explicitly asked for the quote." },
  }),
  get_business_plan_exports: obj({ plan_id: PLAN_ID_PROP }),
  start_financing_application: obj({ plan_id: PLAN_ID_PROP }),
};

export const BUSINESS_PLAN_TOOL_DESCRIPTIONS: Record<BusinessPlanToolName, string> = {
  calculate_vending_business_plan:
    "Deterministically calculate a vending business plan (works for guests; nothing is saved): per-cooler economics, conservative/base/growth scenarios, Year 1 monthly ramp, Years 2–5, sources and uses from live catalog prices, break-even, and the SBA and alternative financing cases. Use this for every financial figure; never compute them yourself.",
  recommend_vending_package:
    "Deterministically assess which package the customer's own answers support. Always leads with the 10/10/10 Launch Plan and reports honestly when hours, capital, vehicle, storage, or a smaller target make the five-machine or one-machine plan the right starting point.",
  start_vending_business_plan:
    "Save a new business plan for the signed-in customer from the discovery answers and assumptions gathered so far. Returns the plan_id and the calculated plan. Requires sign-in; use calculate_vending_business_plan for guests.",
  update_vending_business_plan:
    "Change a saved plan (package, discovery answers, assumption overrides, rollout, website decision, financing case, cash contribution, or confirmation) and recalculate everything deterministically as a new version.",
  get_vending_business_plan:
    "Load the signed-in customer's saved business plan (latest when plan_id is null) with its current calculations, quote reference, and financing status.",
  create_quote_from_business_plan:
    "Turn the saved plan into the customer's Vending Connector quote using live catalog prices: coolers (freight added automatically), 10/10/10 placements for that package, and the website unless declined. Working capital and location allowances are never quote lines. With confirm:false it only previews; with confirm:true it creates or updates the quote idempotently. Only send confirm:true after the customer explicitly asks for the quote.",
  get_business_plan_exports:
    "Return download links for the saved plan as Excel (.xlsx), Word (.docx), and PDF, generated on the server from the same stored plan. Sign-in required.",
  start_financing_application:
    "Record that the customer wants to apply for financing on the saved plan and return the secure Vending Connector financing application link carrying only the plan reference, package, and approximate amount. Never collect application details in chat, and never describe the outcome as approved.",
};
