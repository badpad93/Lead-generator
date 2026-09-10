import { readinessFor } from "@/lib/commerce/checkout";
import { checkoutAccessFor } from "@/lib/commerce/checkoutAccess";
import { getOrCreateDraft, getOwnedQuote, listLines, rebuildQuote, revalidateQuote, type QuoteBundle, type QuoteViewer } from "@/lib/commerce/quotes";
import type { QuoteOperation } from "@/lib/commerce/quotePricing";
import { QuoteError, type QuoteRow } from "@/lib/commerce/quoteTypes";
import { toQuoteView, type QuoteView } from "@/lib/commerce/quoteView";
import { PLAN_CATALOG_KEYS } from "./packages";
import type { PlanRow } from "./store";
import { linkPlanQuote } from "./store";

/**
 * The plan → quote bridge. The quote is the existing commerce quote: the
 * server prices every line from the live catalog, freight follows each
 * cooler automatically, the 10/10/10 placement line keeps its
 * qualification requirement, and the machine purchase agreement,
 * readiness, tax, and checkout rules are untouched. Working capital,
 * opening inventory, and the location allowance for the smaller packages
 * are never lines.
 *
 * Idempotent: the plan remembers its quote; re-running sets the same
 * quantities on the same quote and reports no change. Lines the customer
 * added for other reasons are left alone.
 */
export interface PlanQuoteLine {
  ref: string;
  quantity: number;
}

/** The catalog refs and quantities the plan asks for. */
export function planQuoteLines(plan: PlanRow): PlanQuoteLine[] {
  const machines = plan.outputs.machines;
  const lines: PlanQuoteLine[] = [{ ref: PLAN_CATALOG_KEYS.cooler, quantity: machines }];
  if (plan.package === "ten_ten_ten") lines.push({ ref: PLAN_CATALOG_KEYS.placement_10_10_10, quantity: machines });
  if (plan.website_included) lines.push({ ref: PLAN_CATALOG_KEYS.website, quantity: 1 });
  return lines;
}

/** Refs this bridge manages; anything else on the quote is the customer's own business. */
const MANAGED_REFS: ReadonlySet<string> = new Set([PLAN_CATALOG_KEYS.cooler, PLAN_CATALOG_KEYS.placement_10_10_10, PLAN_CATALOG_KEYS.website]);

function operationsFor(desired: PlanQuoteLine[], existing: Array<{ catalog_key: string | null; quantity: number; is_auto_add_on: boolean }>): QuoteOperation[] {
  const current = new Map(existing.filter((l) => !l.is_auto_add_on && l.catalog_key).map((l) => [l.catalog_key as string, l.quantity]));
  const ops: QuoteOperation[] = [];
  for (const d of desired) {
    const have = current.get(d.ref);
    if (have === undefined) ops.push({ op: "add", ref: d.ref, quantity: d.quantity });
    else if (have !== d.quantity) ops.push({ op: "set_quantity", ref: d.ref, quantity: d.quantity });
  }
  for (const ref of current.keys()) if (MANAGED_REFS.has(ref) && !desired.some((d) => d.ref === ref)) ops.push({ op: "remove", ref, quantity: null });
  return ops;
}

async function targetQuote(plan: PlanRow, viewer: QuoteViewer): Promise<QuoteRow> {
  if (plan.quote_id) {
    const own = await getOwnedQuote(plan.quote_id, viewer.userId);
    if (own.status === "draft" || own.status === "confirmed") return own;
  }
  return getOrCreateDraft(viewer, plan.thread_id);
}

export interface PlanQuoteResult {
  quote: QuoteView;
  /** True when this call changed lines; false when the quote already matched the plan. */
  changed: boolean;
  /** Lines on the quote that the plan does not manage (the customer's own additions). */
  other_line_count: number;
  plan: PlanRow;
}

function assertCatalogComplete(plan: PlanRow): void {
  const needed = planQuoteLines(plan).map((l) => l.ref);
  const missing = plan.catalog_snapshot.missing.filter((m) => needed.includes(m));
  if (missing.length > 0) {
    throw new QuoteError("item_not_quotable", `The final quote needs catalog correction before it can be created: ${missing.join(", ")} is not in the live catalog.`, { missing });
  }
}

export async function createQuoteFromPlan(plan: PlanRow, viewer: QuoteViewer): Promise<PlanQuoteResult> {
  assertCatalogComplete(plan);
  const quote = await targetQuote(plan, viewer);
  const existing = await listLines(quote.id);
  const ops = operationsFor(planQuoteLines(plan), existing);
  const bundle: QuoteBundle = ops.length > 0 ? await rebuildQuote(quote, ops, viewer) : await revalidateQuote(quote, viewer);
  const linked = plan.quote_id === bundle.quote.id && plan.status === "quoted" ? plan : await linkPlanQuote(plan, bundle.quote.id);
  const readiness = await readinessFor(bundle.quote, viewer, await checkoutAccessFor(viewer.userId));
  const other = bundle.lines.filter((l) => !l.is_auto_add_on && !(l.catalog_key && MANAGED_REFS.has(l.catalog_key))).length;
  return { quote: toQuoteView(bundle.quote, bundle.lines, bundle.changes, readiness), changed: ops.length > 0, other_line_count: other, plan: linked };
}

/** A read-only preview of what confirmation would put on the quote, priced from the plan's catalog snapshot. */
export function previewQuoteLines(plan: PlanRow): Array<PlanQuoteLine & { name: string; unit_price: number | null; line_total: number | null; note: string }> {
  const snap = plan.catalog_snapshot;
  const byKey = new Map([snap.cooler, snap.freight, snap.placement_10_10_10, snap.website].filter((s) => s !== null).map((s) => [s.key, s]));
  const notes: Record<string, string> = {
    [PLAN_CATALOG_KEYS.cooler]: "Freight is added automatically, one per cooler. Requires the machine purchase agreement before checkout.",
    [PLAN_CATALOG_KEYS.placement_10_10_10]: "Requires recorded 10/10/10 qualification by the location team before checkout.",
    [PLAN_CATALOG_KEYS.website]: "Included unless declined.",
  };
  return planQuoteLines(plan).map((l) => {
    const s = byKey.get(l.ref);
    return { ...l, name: s?.name ?? l.ref, unit_price: s?.unit_price ?? null, line_total: s ? Math.round(s.unit_price * l.quantity * 100) / 100 : null, note: s ? notes[l.ref] : "Missing from the live catalog; the final quote needs catalog correction." };
  });
}
