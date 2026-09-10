import { PACKAGES, recommendPackage, type PackageRecommendation } from "@/lib/businessPlan/packages";
import { loadPlanCatalog } from "@/lib/businessPlan/catalogPrices";
import { catalogFromSnapshot } from "@/lib/businessPlan/packages";
import { financingPlanUrl, SIGN_IN_PATH } from "@/lib/businessPlan/financingRef";
import { buildPlanView, defaultInputs, type PlanInputs, type PlanView } from "@/lib/businessPlan/plan";
import { mergeProfile, missingDiscovery, type OperatorProfile } from "@/lib/businessPlan/profile";
import { createQuoteFromPlan, previewQuoteLines } from "@/lib/businessPlan/quoteFromPlan";
import { createPlan, getOwnedPlan, latestPlan, savePlanVersion, setPlanFinancing, type PlanRow } from "@/lib/businessPlan/store";
import { getOwnedQuote } from "@/lib/commerce/quotes";
import { QuoteError } from "@/lib/commerce/quoteTypes";
import type { QuoteView } from "@/lib/commerce/quoteView";
import { assertPublicShape } from "../publicShapes";
import type { CalculateBusinessPlanInput, CreateQuoteFromPlanInput, GetBusinessPlanInput, PlanSpecInput, RecommendPackageInput, UpdateBusinessPlanInput } from "./businessPlanSchemas";
import type { ToolContext } from "./context";

/**
 * Business-plan tool handlers. Every number in every output was produced
 * by the deterministic engine from the customer's inputs and the live
 * catalog; the model only relays it. Guests get an unsaved estimate;
 * saving, quoting, exporting, and the financing hand-off need a
 * signed-in customer and the write-tools flag.
 */
export type PlanOutputStatus = "estimate" | "saved";

export interface PlanToolOutput {
  status: PlanOutputStatus;
  saved: boolean;
  plan_id: string | null;
  plan_number: string | null;
  version: number | null;
  plan_status: string | null;
  quote: { quote_id: string; quote_number: string; status: string; subtotal: number } | null;
  financing_status: string;
  plan: PlanView;
  /** Discovery fields still unanswered, in the order Vinnie should ask (one to three per turn). */
  missing_discovery: string[];
  next_step: string;
  notices: string[];
  sign_in_href: string | null;
}

const ESTIMATE_NOTICE = "Educational estimate only; nothing is saved. Sign in to save the plan, export it, build the quote, or apply for financing.";

function nextStep(view: PlanView, missing: string[], saved: boolean): string {
  if (missing.length > 0) return `Ask about ${missing.slice(0, 3).join(", ")} (no more than three questions), then recalculate.`;
  if (!view.confirmed) return "Summarize the assumptions with their sources and ask the customer to confirm them before presenting the final plan.";
  if (!saved) return "Invite the customer to sign in so the confirmed plan can be saved, exported, and turned into a quote.";
  return "Walk through the plan, then ask whether to create the quote; after the quote, close with the financing application.";
}

function applyRollout(next: PlanInputs, rollout: PlanSpecInput["rollout"] | undefined): void {
  if (!rollout) return;
  if (rollout.machines_per_month !== null) next.rollout.machines_per_month = rollout.machines_per_month;
  if (rollout.first_month_share !== null) next.rollout.ramp[0] = rollout.first_month_share;
  if (rollout.second_month_share !== null) next.rollout.ramp[1] = rollout.second_month_share;
}

function applyWebsite(next: PlanInputs, included: boolean | null | undefined): void {
  if (included === false) {
    next.website_included = false;
    next.website_decision = "declined";
  } else if (included === true) {
    next.website_included = true;
    next.website_decision = "accepted";
  }
}

function applyAssumptions(next: PlanInputs, spec: Partial<PlanSpecInput>): void {
  for (const [k, v] of Object.entries(spec.assumptions ?? {})) if (typeof v === "number") (next.assumptions as Record<string, number>)[k] = v;
  const fee = spec.operator?.expected_location_fee_rate;
  if (typeof fee === "number" && next.assumptions.location_fee_rate === undefined) next.assumptions.location_fee_rate = fee;
}

function applySpec(base: PlanInputs, spec: Partial<PlanSpecInput>): PlanInputs {
  const next: PlanInputs = { ...base, profile: mergeProfile(base.profile, spec.operator ?? null), assumptions: { ...base.assumptions }, rollout: { ...base.rollout, ramp: [...base.rollout.ramp] as [number, number, number] } };
  if (spec.package) next.package = spec.package as PlanInputs["package"];
  applyAssumptions(next, spec);
  applyRollout(next, spec.rollout);
  applyWebsite(next, spec.website_included);
  if (spec.financing_case) next.financing_case = spec.financing_case;
  if (typeof spec.cash_contribution === "number") next.owner_cash = spec.cash_contribution;
  return next;
}

async function quoteSummary(plan: PlanRow): Promise<PlanToolOutput["quote"]> {
  if (!plan.quote_id) return null;
  try {
    const q = await getOwnedQuote(plan.quote_id, plan.user_id);
    return { quote_id: q.id, quote_number: q.quote_number, status: q.status, subtotal: q.subtotal };
  } catch {
    return null;
  }
}

function noticesFor(view: PlanView, saved: boolean, extra: string[]): string[] {
  const notices = saved ? [...extra] : [ESTIMATE_NOTICE, ...extra];
  if (view.catalog_missing.length > 0) notices.push(`Catalog correction needed before a final quote: ${view.catalog_missing.join(", ")} not found in the live catalog.`);
  if (view.recommendation.honest_downsell) notices.push(`Honest fit check: the customer's inputs point to the ${PACKAGES[view.recommendation.recommended].name}. Lead with 10/10/10, explain the concern, and recommend the smaller start.`);
  return notices;
}

/** The save-state fields of an output: nulls for an unsaved estimate, the row's identity otherwise. */
function saveState(row: PlanRow | null): Pick<PlanToolOutput, "status" | "saved" | "plan_id" | "plan_number" | "version" | "plan_status" | "financing_status" | "sign_in_href"> {
  if (!row) return { status: "estimate", saved: false, plan_id: null, plan_number: null, version: null, plan_status: null, financing_status: "none", sign_in_href: SIGN_IN_PATH };
  return { status: "saved", saved: true, plan_id: row.id, plan_number: row.plan_number, version: row.version, plan_status: row.status, financing_status: row.financing_status, sign_in_href: null };
}

function output(view: PlanView, row: PlanRow | null, quote: PlanToolOutput["quote"], extraNotices: string[] = []): PlanToolOutput {
  const missing = missingDiscovery(view.profile);
  const saved = row !== null;
  return assertPublicShape({ ...saveState(row), quote, plan: view, missing_discovery: missing, next_step: nextStep(view, missing, saved), notices: noticesFor(view, saved, extraNotices) });
}

// ─── Handlers ────────────────────────────────────────────────────────

export async function runCalculateBusinessPlan(input: CalculateBusinessPlanInput): Promise<PlanToolOutput> {
  const inputs = applySpec(defaultInputs(), input);
  const catalog = await loadPlanCatalog();
  return output(buildPlanView(inputs, catalog), null, null);
}

export interface RecommendOutput {
  recommendation: PackageRecommendation;
  packages: Array<{ package: string; name: string; machines: number; estimate_total: number; estimate_working_capital: number; pitch: string }>;
  guidance: string;
}

export function runRecommendVendingPackage(input: RecommendPackageInput): RecommendOutput {
  const recommendation = recommendPackage(input.operator as OperatorProfile);
  return assertPublicShape({
    recommendation,
    packages: recommendation.ladder.map((l) => ({ package: l.package, name: l.name, machines: l.machines, estimate_total: l.estimate_total, estimate_working_capital: PACKAGES[l.package].estimate_working_capital, pitch: PACKAGES[l.package].pitch })),
    guidance: recommendation.honest_downsell
      ? `Present the 10/10/10 Launch Plan first, then explain plainly why the ${PACKAGES[recommendation.recommended].name} fits these inputs better. Never present the three as equal choices.`
      : "Present the 10/10/10 Launch Plan first. Step down to five, then one, only if the customer raises a capital, capacity, or risk objection.",
  });
}

function requireCustomer(ctx: ToolContext): string {
  if (!ctx.profile) throw new QuoteError("authentication_required", "Sign in to save a business plan.");
  return ctx.profile.id;
}

function requireWrite(ctx: ToolContext): void {
  if (!ctx.writeToolsEnabled) throw new QuoteError("write_tools_disabled", "Saved business plans are not available yet.");
}

async function loadPlan(planId: string | null, userId: string): Promise<PlanRow> {
  if (planId) return getOwnedPlan(planId, userId);
  const latest = await latestPlan(userId);
  if (!latest) throw new QuoteError("not_found", "No saved business plan yet. Start one first.");
  return latest;
}

export async function runStartBusinessPlan(input: PlanSpecInput, ctx: ToolContext): Promise<PlanToolOutput> {
  const userId = requireCustomer(ctx);
  requireWrite(ctx);
  const inputs = applySpec(defaultInputs(), input);
  const catalog = await loadPlanCatalog();
  const view = buildPlanView(inputs, catalog);
  const row = await createPlan(userId, ctx.threadId, { inputs, catalog, view });
  return output(view, row, null);
}

function statusFor(plan: PlanRow, inputs: PlanInputs): PlanRow["status"] {
  if (plan.status === "quoted") return "quoted";
  return inputs.confirmed ? "confirmed" : "draft";
}

export async function runUpdateBusinessPlan(input: UpdateBusinessPlanInput, ctx: ToolContext): Promise<PlanToolOutput> {
  const userId = requireCustomer(ctx);
  requireWrite(ctx);
  const plan = await loadPlan(input.plan_id, userId);
  const inputs = applySpec(plan.inputs, input.changes);
  for (const k of input.changes.reset_assumptions ?? []) delete (inputs.assumptions as Record<string, number>)[k];
  if (input.changes.confirmed !== null) inputs.confirmed = input.changes.confirmed;
  const catalog = await loadPlanCatalog();
  const view = buildPlanView(inputs, catalog);
  const status = statusFor(plan, inputs);
  const row = await savePlanVersion(plan, { inputs, catalog, view, status });
  return output(view, row, await quoteSummary(row), row.quote_id ? ["The plan changed after its quote was created; re-run the quote (with confirmation) so the lines match."] : []);
}

export async function runGetBusinessPlan(input: GetBusinessPlanInput, ctx: ToolContext): Promise<PlanToolOutput> {
  const userId = requireCustomer(ctx);
  const plan = await loadPlan(input.plan_id, userId);
  return output(buildPlanView(plan.inputs, catalogFromSnapshot(plan.catalog_snapshot)), plan, await quoteSummary(plan));
}

export type CreateQuoteOutput =
  | { status: "confirmation_required"; plan_id: string; preview: ReturnType<typeof previewQuoteLines>; reconciliation: Reconciliation; message: string }
  | { status: "quote"; changed: boolean; plan_id: string; quote: QuoteView; other_line_count: number; reconciliation: Reconciliation; message: string };

interface Reconciliation {
  quote_subtotal: number | null;
  working_capital_allowance: number;
  cash_contribution: number;
  financing_request: number;
  note: string;
}

function reconciliation(plan: PlanRow, quoteSubtotal: number | null): Reconciliation {
  const su = plan.outputs.sources_and_uses;
  return { quote_subtotal: quoteSubtotal, working_capital_allowance: su.working_capital_allowance, cash_contribution: su.owner_cash, financing_request: su.financing_request, note: "The quote lists Vending Connector items at current catalog prices, pre-tax. Working capital (including opening inventory) is part of the financing request only and is never an invoice line." };
}

export async function runCreateQuoteFromPlan(input: CreateQuoteFromPlanInput, ctx: ToolContext): Promise<CreateQuoteOutput> {
  const userId = requireCustomer(ctx);
  requireWrite(ctx);
  const plan = await loadPlan(input.plan_id, userId);
  if (!input.confirm) {
    const preview = previewQuoteLines(plan);
    const subtotal = preview.every((p) => p.line_total !== null) ? Math.round(preview.reduce((s, p) => s + (p.line_total ?? 0), 0) * 100) / 100 : null;
    return assertPublicShape({ status: "confirmation_required", plan_id: plan.id, preview, reconciliation: reconciliation(plan, subtotal), message: "Show these lines and ask the customer to confirm before creating the quote. Freight is added by the server, one per cooler." });
  }
  const result = await createQuoteFromPlan(plan, { userId, storefront: ctx.storefront });
  return assertPublicShape({ status: "quote", changed: result.changed, plan_id: plan.id, quote: result.quote, other_line_count: result.other_line_count, reconciliation: reconciliation(result.plan, result.quote.subtotal), message: result.changed ? "The quote now matches the plan." : "The quote already matched the plan; nothing changed." });
}

export const EXPORT_FORMATS = [
  { format: "xlsx", label: "Excel workbook (.xlsx)" },
  { format: "docx", label: "Word document (.docx)" },
  { format: "pdf", label: "PDF" },
] as const;

export function exportHref(planId: string, format: string): string {
  return `/api/assistant/business-plan/${planId}/export?format=${format}`;
}

export async function runGetBusinessPlanExports(input: GetBusinessPlanInput, ctx: ToolContext): Promise<{ status: "exports"; plan_id: string; plan_number: string; version: number; exports: Array<{ format: string; label: string; href: string }>; note: string }> {
  const userId = requireCustomer(ctx);
  const plan = await loadPlan(input.plan_id, userId);
  return assertPublicShape({
    status: "exports",
    plan_id: plan.id,
    plan_number: plan.plan_number,
    version: plan.version,
    exports: EXPORT_FORMATS.map((f) => ({ format: f.format, label: f.label, href: exportHref(plan.id, f.format) })),
    note: "Each file is generated on the server from the saved plan. Upload the .docx or .xlsx to Google Docs or Sheets if you prefer those tools.",
  });
}

export interface FinancingActionOutput {
  status: "financing_action";
  plan_id: string;
  package_name: string;
  financing_request: number;
  monthly_payment_estimates: Array<{ label: string; term_years: number; annual_rate: number; monthly_payment: number }>;
  href: string;
  financing_status: string;
  notice: string;
}

export async function runStartFinancingApplication(input: GetBusinessPlanInput, ctx: ToolContext): Promise<FinancingActionOutput> {
  const userId = requireCustomer(ctx);
  requireWrite(ctx);
  const plan = await loadPlan(input.plan_id, userId);
  const row = plan.financing_status === "none" ? await setPlanFinancing(plan, "application_started") : plan;
  const view = row.outputs;
  return assertPublicShape({
    status: "financing_action",
    plan_id: row.id,
    package_name: view.package_name,
    financing_request: view.sources_and_uses.financing_request,
    monthly_payment_estimates: view.financing.options.map((o) => ({ label: o.label, term_years: o.term_years, annual_rate: o.annual_rate, monthly_payment: o.plan.monthly_payment })),
    href: financingPlanUrl(row.id, row.quote_id),
    financing_status: row.financing_status,
    notice: "The secure financing application collects the lender's required details outside this chat. It is an application, not an approval; rates, terms, and eligibility are the lender's decision, and no invoice is created from it.",
  });
}
