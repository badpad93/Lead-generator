import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssistantError } from "@/lib/assistant/errors";
import { QuoteError } from "@/lib/commerce/quoteTypes";
import { ENGINE_VERSION, type PackageKey } from "./assumptions";
import type { PlanCatalog } from "./packages";
import type { PlanInputs, PlanView, WebsiteDecision } from "./plan";

/**
 * The only module that touches commerce_business_plans. Every read is
 * scoped to the owner the server resolved; the client and the model never
 * supply a user id. Writes go through the service role.
 */
export type PlanStatus = "draft" | "confirmed" | "quoted" | "archived";
export type PlanFinancingStatus = "none" | "application_started" | "application_submitted";

export interface PlanRow {
  id: string;
  user_id: string;
  thread_id: string | null;
  plan_number: string;
  version: number;
  engine_version: string;
  status: PlanStatus;
  package: PackageKey;
  website_included: boolean;
  website_decision: WebsiteDecision;
  inputs: PlanInputs;
  catalog_snapshot: PlanCatalog;
  outputs: PlanView;
  quote_id: string | null;
  financing_status: PlanFinancingStatus;
  financing_application_id: string | null;
  created_at: string;
  updated_at: string;
}

export const PLAN_COLUMNS = "id, user_id, thread_id, plan_number, version, engine_version, status, package, website_included, website_decision, inputs, catalog_snapshot, outputs, quote_id, financing_status, financing_application_id, created_at, updated_at";
const TABLE = "commerce_business_plans";

function dbFail(op: string, message: string): never {
  console.error(`[businessPlan/store] ${op} failed:`, message);
  throw new AssistantError("upstream_error", "The business plan could not be saved right now.");
}

export interface PlanPayload {
  inputs: PlanInputs;
  catalog: PlanCatalog;
  view: PlanView;
  status?: PlanStatus;
}

function columnsFor(p: PlanPayload) {
  return {
    engine_version: ENGINE_VERSION,
    package: p.inputs.package,
    website_included: p.inputs.website_included,
    website_decision: p.inputs.website_decision,
    inputs: p.inputs,
    catalog_snapshot: p.catalog,
    outputs: p.view,
  };
}

export async function createPlan(userId: string, threadId: string | null, payload: PlanPayload): Promise<PlanRow> {
  const { data, error } = await supabaseAdmin.from(TABLE).insert({ user_id: userId, thread_id: threadId, status: payload.status ?? "draft", version: 1, ...columnsFor(payload) }).select(PLAN_COLUMNS).single();
  if (error || !data) return dbFail("createPlan", error?.message ?? "no row");
  return data as PlanRow;
}

/** Owner-scoped read; a foreign or missing plan is `not_found` either way. */
export async function getOwnedPlan(planId: string, userId: string): Promise<PlanRow> {
  const { data, error } = await supabaseAdmin.from(TABLE).select(PLAN_COLUMNS).eq("id", planId).maybeSingle();
  if (error) return dbFail("getOwnedPlan", error.message);
  const row = data as PlanRow | null;
  if (!row || row.user_id !== userId) throw new QuoteError("not_found", "Business plan not found.");
  return row;
}

export async function latestPlan(userId: string): Promise<PlanRow | null> {
  const { data, error } = await supabaseAdmin.from(TABLE).select(PLAN_COLUMNS).eq("user_id", userId).neq("status", "archived").order("updated_at", { ascending: false }).limit(1);
  if (error) return dbFail("latestPlan", error.message);
  const rows = (data ?? []) as PlanRow[];
  return rows[0] ?? null;
}

/** Save a new version; the version guard makes concurrent edits fail closed instead of clobbering. */
export async function savePlanVersion(plan: PlanRow, payload: PlanPayload): Promise<PlanRow> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ version: plan.version + 1, status: payload.status ?? plan.status, ...columnsFor(payload) })
    .eq("id", plan.id)
    .eq("user_id", plan.user_id)
    .eq("version", plan.version)
    .select(PLAN_COLUMNS)
    .maybeSingle();
  if (error) return dbFail("savePlanVersion", error.message);
  if (!data) throw new QuoteError("version_mismatch", "The plan changed while it was being updated. Load it again and retry.");
  return data as PlanRow;
}

export async function linkPlanQuote(plan: PlanRow, quoteId: string): Promise<PlanRow> {
  const { data, error } = await supabaseAdmin.from(TABLE).update({ quote_id: quoteId, status: "quoted" }).eq("id", plan.id).eq("user_id", plan.user_id).select(PLAN_COLUMNS).single();
  if (error || !data) return dbFail("linkPlanQuote", error?.message ?? "no row");
  return data as PlanRow;
}

export async function setPlanFinancing(plan: PlanRow, status: PlanFinancingStatus, applicationId: string | null = plan.financing_application_id): Promise<PlanRow> {
  const { data, error } = await supabaseAdmin.from(TABLE).update({ financing_status: status, financing_application_id: applicationId }).eq("id", plan.id).eq("user_id", plan.user_id).select(PLAN_COLUMNS).single();
  if (error || !data) return dbFail("setPlanFinancing", error?.message ?? "no row");
  return data as PlanRow;
}
