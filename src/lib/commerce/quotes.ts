import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveCoffeeProductsPricing, type StorefrontContext } from "@/lib/coffeePricing";
import { getHiddenProductIds } from "@/lib/storefront/visibility";
import { CATALOG_COLUMNS, type CommerceCatalogItem } from "./catalog";
import {
  applyDepositWaiver,
  assertLineCount,
  assertQuantity,
  assertQuotable,
  catalogDraft,
  coffeeDraft,
  diffLines,
  lineIdentity,
  totals,
  withAddOns,
  type CoffeeProductRow,
  type LineDraft,
  type LineIdentity,
  type PricingInputs,
  type QuoteOperation,
} from "./quotePricing";
import { QUOTE_EXPIRY_DAYS, QuoteError, type QuoteChange, type QuoteLineRow, type QuoteRow } from "./quoteTypes";

/**
 * Quote domain service — the only module that writes commerce_quotes and
 * commerce_quote_lines. Every entry point takes the SERVER-resolved
 * viewer; the browser and the model never supply user ids, prices,
 * totals, QuickBooks ids, or URLs. All writes run with the service role
 * after an explicit ownership check.
 */
export interface QuoteViewer {
  userId: string;
  storefront: StorefrontContext | null;
}

export interface QuoteBundle {
  quote: QuoteRow;
  lines: QuoteLineRow[];
  changes: QuoteChange[];
}

const QUOTE_COLUMNS =
  "id, user_id, thread_id, quote_number, status, currency, version, confirmed_version, confirmed_at, expires_at, financing_program, financing_status, financing_application_id, financing_interest_at, agreement_state, subtotal, tax_status, total, qb_customer_id, qb_invoice_id, qb_invoice_doc_number, qb_invoice_status, checkout_status, checkout_url, checkout_idempotency_key, checkout_started_at, checkout_completed_at, status_reconciled_at, created_at, updated_at";
const LINE_COLUMNS =
  "id, quote_id, source_type, catalog_item_id, coffee_product_id, catalog_key, description, quantity, unit_price, line_total, pricing_basis, parent_line_id, is_auto_add_on, validation_status, staff_determination_by, staff_determination_at, staff_determination_note, sort_order";

const EDITABLE = new Set(["draft", "confirmed"]);
const UUID = /^[0-9a-f-]{36}$/i;

function dbFail(op: string, message: string): never {
  console.error(`[commerce/quotes] ${op} failed:`, message);
  throw new QuoteError("upstream_error", "The quote could not be saved. Please try again.");
}

function normalizeQuote(row: Record<string, unknown>): QuoteRow {
  return { ...(row as unknown as QuoteRow), subtotal: Number(row.subtotal), total: Number(row.total) };
}

function normalizeLine(row: Record<string, unknown>): QuoteLineRow {
  return { ...(row as unknown as QuoteLineRow), unit_price: Number(row.unit_price), line_total: Number(row.line_total) };
}

// ─── Reads ─────────────────────────────────────────────────────────

/** The customer's most recent quote that is still meaningful to show, or null. */
export async function getCurrentQuote(userId: string): Promise<QuoteRow | null> {
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .select(QUOTE_COLUMNS)
    .eq("user_id", userId)
    .in("status", ["draft", "confirmed", "checkout_pending", "invoiced"])
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) return dbFail("getCurrentQuote", error.message);
  const row = (data as Record<string, unknown>[] | null)?.[0];
  return row ? expireIfNeeded(normalizeQuote(row)) : null;
}

/** Owner-scoped fetch; a foreign id is indistinguishable from a missing one. */
export async function getOwnedQuote(quoteId: string, userId: string): Promise<QuoteRow> {
  if (!UUID.test(quoteId)) throw new QuoteError("not_found", "Quote not found.");
  const { data, error } = await supabaseAdmin.from("commerce_quotes").select(QUOTE_COLUMNS).eq("id", quoteId).maybeSingle();
  if (error) return dbFail("getOwnedQuote", error.message);
  const quote = data ? normalizeQuote(data as Record<string, unknown>) : null;
  if (!quote || quote.user_id !== userId) throw new QuoteError("not_found", "Quote not found.");
  return expireIfNeeded(quote);
}

export async function listLines(quoteId: string): Promise<QuoteLineRow[]> {
  const { data, error } = await supabaseAdmin.from("commerce_quote_lines").select(LINE_COLUMNS).eq("quote_id", quoteId).order("sort_order", { ascending: true });
  if (error) return dbFail("listLines", error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(normalizeLine);
}

/** A confirmed quote past its expiry flips to expired on read (never charged). */
export async function expireIfNeeded(quote: QuoteRow): Promise<QuoteRow> {
  if (quote.status !== "confirmed" || !quote.expires_at || new Date(quote.expires_at).getTime() > Date.now()) return quote;
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ status: "expired", checkout_status: "none", checkout_url: null })
    .eq("id", quote.id)
    .eq("status", "confirmed")
    .select(QUOTE_COLUMNS)
    .maybeSingle();
  if (error) return dbFail("expireIfNeeded", error.message);
  return data ? normalizeQuote(data as Record<string, unknown>) : { ...quote, status: "expired" };
}

/** The editable quote for this customer, creating a fresh draft when none is editable. */
export async function getOrCreateDraft(viewer: QuoteViewer, threadId: string | null): Promise<QuoteRow> {
  const current = await getCurrentQuote(viewer.userId);
  if (current && EDITABLE.has(current.status)) return current;
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .insert({ user_id: viewer.userId, thread_id: threadId, status: "draft", version: 1 })
    .select(QUOTE_COLUMNS)
    .single();
  if (error || !data) return dbFail("getOrCreateDraft", error?.message ?? "no row");
  return normalizeQuote(data as Record<string, unknown>);
}

// ─── Catalog + coffee inputs ───────────────────────────────────────

async function loadKeyedCatalog(): Promise<CommerceCatalogItem[]> {
  const { data, error } = await supabaseAdmin.from("catalog_items").select(CATALOG_COLUMNS).not("catalog_key", "is", null);
  if (error) return dbFail("loadKeyedCatalog", error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ ...(r as unknown as CommerceCatalogItem), unit_price: Number(r.unit_price), active: r.active === true }));
}

async function loadCoffee(ids: string[], viewer: QuoteViewer): Promise<PricingInputs["coffee"]> {
  const out = new Map<string, CoffeeProductRow>();
  if (ids.length === 0) return out;
  const { data, error } = await supabaseAdmin.from("coffee_products").select("id, name, sku, active, stock_status").in("id", ids);
  if (error) return dbFail("loadCoffee", error.message);
  const hidden = viewer.storefront ? await getHiddenProductIds(viewer.storefront.tenantId) : new Set<string>();
  for (const row of (data ?? []) as CoffeeProductRow[]) out.set(row.id, { ...row, active: row.active === true, hidden: hidden.has(row.id) });
  return out;
}

async function pricingInputs(coffeeIds: string[], viewer: QuoteViewer): Promise<PricingInputs> {
  const [catalog, coffee] = await Promise.all([loadKeyedCatalog(), loadCoffee(coffeeIds, viewer)]);
  const coffeePricing = coffeeIds.length
    ? await resolveCoffeeProductsPricing({ productIds: coffeeIds, userId: viewer.userId, storefront: viewer.storefront })
    : new Map();
  return { catalog, coffee, coffeePricing, viewer: { userId: viewer.userId, storefront: !!viewer.storefront } };
}

// ─── Operations ────────────────────────────────────────────────────

interface ManualEntry {
  identity: LineIdentity;
  quantity: number;
  prior: QuoteLineRow | null;
}

type Target = { identity: LineIdentity; catalog: CommerceCatalogItem } | { identity: LineIdentity; coffeeId: string };

function resolveTarget(ref: string, catalog: CommerceCatalogItem[]): Target {
  const byKey = catalog.find((c) => c.catalog_key === ref);
  if (byKey) return { identity: `catalog:${byKey.id}`, catalog: byKey };
  if (!UUID.test(ref)) throw new QuoteError("not_found", "That item is not in the catalog.", { ref });
  const byId = catalog.find((c) => c.id.toLowerCase() === ref.toLowerCase());
  if (byId) return { identity: `catalog:${byId.id}`, catalog: byId };
  return { identity: `coffee:${ref.toLowerCase()}`, coffeeId: ref.toLowerCase() };
}

function applyOperation(entries: Map<LineIdentity, ManualEntry>, op: QuoteOperation, target: Target): void {
  if (op.op === "remove") {
    entries.delete(target.identity);
    return;
  }
  if ("catalog" in target) assertQuotable(target.catalog);
  const quantity = assertQuantity(op.quantity ?? 1);
  const existing = entries.get(target.identity);
  const next = op.op === "add" && existing ? Math.min(existing.quantity + quantity, 999) : quantity;
  entries.set(target.identity, { identity: target.identity, quantity: next, prior: existing?.prior ?? null });
}

function manualEntries(lines: QuoteLineRow[]): Map<LineIdentity, ManualEntry> {
  const entries = new Map<LineIdentity, ManualEntry>();
  for (const l of lines) {
    if (!l.is_auto_add_on) entries.set(lineIdentity(l), { identity: lineIdentity(l), quantity: l.quantity, prior: l });
  }
  return entries;
}

function draftFor(entry: ManualEntry, inputs: PricingInputs): LineDraft | null {
  const [kind, id] = entry.identity.split(":") as ["catalog" | "coffee", string];
  if (kind === "catalog") {
    const item = inputs.catalog.find((c) => c.id === id);
    return item ? catalogDraft(item, entry.quantity, entry.prior, null) : null;
  }
  const row = inputs.coffee.get(id);
  if (!row) throw new QuoteError("not_found", "That coffee product is not in the catalog.", { ref: id });
  return coffeeDraft(row, entry.quantity, inputs, entry.prior);
}

// ─── Persist ───────────────────────────────────────────────────────

async function insertLine(quoteId: string, d: LineDraft, parentLineId: string | null, sortOrder: number): Promise<QuoteLineRow> {
  const { identity: _identity, parent_identity: _parent, ...cols } = d;
  const row = { ...cols, quote_id: quoteId, parent_line_id: parentLineId, sort_order: sortOrder };
  const { data, error } = await supabaseAdmin.from("commerce_quote_lines").insert(row).select(LINE_COLUMNS).single();
  if (error || !data) return dbFail("persistLines.insert", error?.message ?? "no row");
  return normalizeLine(data as Record<string, unknown>);
}

/** Rewrite the line set: manual lines first (so add-ons can reference their parent ids). */
async function persistLines(quoteId: string, drafts: LineDraft[]): Promise<QuoteLineRow[]> {
  const { error: delErr } = await supabaseAdmin.from("commerce_quote_lines").delete().eq("quote_id", quoteId);
  if (delErr) return dbFail("persistLines.delete", delErr.message);
  const idByIdentity = new Map<LineIdentity, string>();
  const saved: QuoteLineRow[] = [];
  const ordered = [...drafts.filter((d) => !d.is_auto_add_on), ...drafts.filter((d) => d.is_auto_add_on)];
  for (const [i, d] of ordered.entries()) {
    const parentId = d.parent_identity ? (idByIdentity.get(d.parent_identity) ?? null) : null;
    const line = await insertLine(quoteId, d, parentId, i);
    idByIdentity.set(d.identity, line.id);
    saved.push(line);
  }
  return saved;
}

async function persistQuote(quote: QuoteRow, drafts: LineDraft[], bump: boolean): Promise<QuoteRow> {
  const t = totals(drafts);
  const patch: Record<string, unknown> = { subtotal: t.subtotal, total: t.total, version: bump ? quote.version + 1 : quote.version };
  if (bump && quote.status === "confirmed") Object.assign(patch, { status: "draft", confirmed_at: null, expires_at: null, confirmed_version: null, checkout_status: "none", checkout_url: null });
  const { data, error } = await supabaseAdmin.from("commerce_quotes").update(patch).eq("id", quote.id).select(QUOTE_COLUMNS).single();
  if (error || !data) return dbFail("persistQuote", error?.message ?? "no row");
  return normalizeQuote(data as Record<string, unknown>);
}

/**
 * Rebuild the quote from canonical data: apply operations (if any),
 * re-read every product, reprice, sync add-ons, apply the 10/10/10
 * deposit waiver, persist, and report what changed. Any change or
 * operation bumps the version and drops a prior confirmation.
 */
export async function rebuildQuote(quote: QuoteRow, ops: QuoteOperation[], viewer: QuoteViewer): Promise<QuoteBundle> {
  if (!EDITABLE.has(quote.status)) throw new QuoteError("quote_locked", "This quote can no longer be edited. Start a new quote.", { status: quote.status });
  const existing = await listLines(quote.id);
  const entries = manualEntries(existing);
  const catalog = await loadKeyedCatalog();
  for (const op of ops) applyOperation(entries, op, resolveTarget(op.ref, catalog));
  const coffeeIds = [...entries.keys()].filter((k) => k.startsWith("coffee:")).map((k) => k.slice(7));
  const inputs = await pricingInputs(coffeeIds, viewer);
  const manual = [...entries.values()].map((e) => draftFor(e, inputs)).filter((d): d is LineDraft => d !== null);
  const { lines: drafts, waived } = applyDepositWaiver(withAddOns(manual, inputs.catalog), inputs.catalog);
  assertLineCount(drafts);
  const changes = diffLines(existing, drafts, waived);
  const before = new Set(existing.map(lineIdentity));
  const lineSetChanged = drafts.length !== before.size || drafts.some((d) => !before.has(d.identity));
  const lines = await persistLines(quote.id, drafts);
  const saved = await persistQuote(quote, drafts, ops.length > 0 || changes.length > 0 || lineSetChanged);
  return { quote: saved, lines, changes };
}

/** Re-read and reprice without operations; used before confirmation, checkout, and display. */
export function revalidateQuote(quote: QuoteRow, viewer: QuoteViewer): Promise<QuoteBundle> {
  return rebuildQuote(quote, [], viewer);
}

export type ConfirmOutcome = { outcome: "confirmed"; bundle: QuoteBundle } | { outcome: "changed"; bundle: QuoteBundle };

/**
 * Confirm the quote at the version the customer saw. A version mismatch
 * or any change discovered on re-read is returned instead, so the
 * customer must explicitly confirm again.
 */
async function markConfirmed(bundle: QuoteBundle): Promise<QuoteBundle> {
  const now = new Date();
  const expires = new Date(now.getTime() + QUOTE_EXPIRY_DAYS * 86_400_000);
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ status: "confirmed", confirmed_version: bundle.quote.version, confirmed_at: now.toISOString(), expires_at: expires.toISOString() })
    .eq("id", bundle.quote.id)
    .eq("version", bundle.quote.version)
    .select(QUOTE_COLUMNS)
    .single();
  if (error || !data) return dbFail("confirmQuote", error?.message ?? "no row");
  return { ...bundle, quote: normalizeQuote(data as Record<string, unknown>) };
}

export async function confirmQuote(quote: QuoteRow, expectedVersion: number, viewer: QuoteViewer): Promise<ConfirmOutcome> {
  if (quote.version !== expectedVersion) throw new QuoteError("version_mismatch", "The quote changed since you last saw it. Review the latest version and confirm again.", { current_version: quote.version });
  const bundle = await revalidateQuote(quote, viewer);
  if (bundle.changes.length > 0 || bundle.quote.version !== expectedVersion) return { outcome: "changed", bundle };
  if (bundle.lines.length === 0) throw new QuoteError("invalid_operation", "Add at least one item before confirming a quote.");
  return { outcome: "confirmed", bundle: await markConfirmed(bundle) };
}

/** Record financing interest. Never touches lines, prices, or totals. */
export async function recordFinancingInterest(quote: QuoteRow, program: "standard" | "ten_ten_ten"): Promise<QuoteRow> {
  const status = quote.financing_status === "none" ? "interested" : quote.financing_status;
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ financing_program: program, financing_status: status, financing_interest_at: quote.financing_interest_at ?? new Date().toISOString() })
    .eq("id", quote.id)
    .select(QUOTE_COLUMNS)
    .single();
  if (error || !data) return dbFail("recordFinancingInterest", error?.message ?? "no row");
  return normalizeQuote(data as Record<string, unknown>);
}

/** Cancel the editable quote so the next operation starts a fresh one. */
export async function cancelQuote(quote: QuoteRow): Promise<void> {
  if (!EDITABLE.has(quote.status)) throw new QuoteError("quote_locked", "This quote can no longer be changed.", { status: quote.status });
  const { error } = await supabaseAdmin.from("commerce_quotes").update({ status: "cancelled" }).eq("id", quote.id);
  if (error) return dbFail("cancelQuote", error.message);
}
