import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CATALOG_COLUMNS, isCheckoutReady, type CommerceCatalogItem, type RequiredAgreement } from "./catalog";
import { gateFor, type AgreementGateResult } from "./agreements";
import { createVinnieQuickBooks, vinnieQuickBooksGate, type VinnieQuickBooks } from "./quickbooksAdapter";
import { getOwnedQuote, listLines, revalidateQuote, type QuoteBundle, type QuoteViewer } from "./quotes";
import { QuoteError, type QuoteLineRow, type QuoteRow } from "./quoteTypes";
import type { CheckoutReadiness } from "./quoteView";

/**
 * Checkout: the only path from a quote to a QuickBooks invoice.
 *
 * Runs after an explicit customer click on an authenticated route, never
 * from the model. Order of operations: re-read and reprice → assess every
 * gate (environment, flags, administrator rollout, lines, mappings, tax,
 * agreements, billing address) → construct the production-only adapter →
 * lock the confirmed version → create customer and invoice with real Item
 * references and a deterministic DocNumber → store identifiers → return
 * the validated hosted pay URL. Any gate failure returns a structured
 * explanation and creates nothing; any QuickBooks failure leaves the
 * quote confirmed with checkout_status=failed and no partial invoice.
 */
export interface CustomerProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface CheckoutContext {
  profile: CustomerProfile;
  catalog: Map<string, CommerceCatalogItem>;
  coffeeQbItems: Map<string, string | null>;
  agreements: AgreementGateResult[];
}

/**
 * Who may check out right now. Every field is resolved server-side by the
 * route (flags from the database, administrator status from authoritative
 * profile/auth data, environment from the deployment) and never from the
 * request.
 */
export interface CheckoutAccess {
  checkoutEnabled: boolean;
  publicEnabled: boolean;
  isAdmin: boolean;
  /** Production deployment with the live QuickBooks environment. */
  environmentAllowed: boolean;
}

export const NO_CHECKOUT_ACCESS: CheckoutAccess = { checkoutEnabled: false, publicEnabled: false, isAdmin: false, environmentAllowed: false };

const INVOICE_SKIP = new Set(["location_intake"]);
const BLOCKING_LINE_STATUS: Record<string, string> = {
  inactive: "is no longer available",
  unavailable: "is currently unavailable",
  requires_qualification: "needs a recorded staff determination before it can be checked out",
};

async function loadProfile(userId: string): Promise<CustomerProfile> {
  const { data, error } = await supabaseAdmin.from("profiles").select("id, email, full_name, phone, address, city, state, zip").eq("id", userId).maybeSingle();
  if (error || !data) throw new QuoteError("upstream_error", "Your account could not be loaded.");
  return data as CustomerProfile;
}

async function loadCatalogFor(lines: QuoteLineRow[]): Promise<Map<string, CommerceCatalogItem>> {
  const ids = [...new Set(lines.map((l) => l.catalog_item_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("catalog_items").select(CATALOG_COLUMNS).in("id", ids);
  if (error) throw new QuoteError("upstream_error", "The catalog could not be loaded.");
  return new Map(((data ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), { ...(r as unknown as CommerceCatalogItem), unit_price: Number(r.unit_price), active: r.active === true }]));
}

async function loadCoffeeQbItems(lines: QuoteLineRow[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(lines.map((l) => l.coffee_product_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin.from("coffee_products").select("id, qb_item_id").in("id", ids);
  if (error) throw new QuoteError("upstream_error", "The catalog could not be loaded.");
  return new Map(((data ?? []) as Array<{ id: string; qb_item_id: string | null }>).map((r) => [r.id, r.qb_item_id]));
}

export async function loadCheckoutContext(userId: string, lines: QuoteLineRow[]): Promise<CheckoutContext> {
  const profile = await loadProfile(userId);
  const [catalog, coffeeQbItems] = await Promise.all([loadCatalogFor(lines), loadCoffeeQbItems(lines)]);
  const required = new Set<RequiredAgreement>();
  for (const l of lines) {
    const a = l.catalog_item_id ? catalog.get(l.catalog_item_id)?.required_agreement : null;
    if (a) required.add(a);
  }
  const agreements = await Promise.all([...required].map((a) => gateFor(a, userId, profile.email)));
  return { profile, catalog, coffeeQbItems, agreements };
}

type Reason = CheckoutReadiness["blocked_reasons"][number];

const STAFF_INVOICE = "A staff-issued invoice is required.";

function mappingReasons(line: QuoteLineRow, ctx: CheckoutContext): Reason[] {
  const out: Reason[] = [];
  const item = line.catalog_item_id ? ctx.catalog.get(line.catalog_item_id) : null;
  const missing = item ? isCheckoutReady(item).missing : [];
  const coffeeUnmapped = !!line.coffee_product_id && !ctx.coffeeQbItems.get(line.coffee_product_id);
  if (missing.includes("qb_item_id") || coffeeUnmapped) out.push({ code: "mapping_missing", message: `${line.description} is not yet mapped for invoicing. ${STAFF_INVOICE}`, line_id: line.id });
  if (missing.includes("tax_treatment")) out.push({ code: "tax_unset", message: `Tax treatment for ${line.description} has not been established. ${STAFF_INVOICE}`, line_id: line.id });
  return out;
}

function lineReasons(line: QuoteLineRow, ctx: CheckoutContext): Reason[] {
  const blocked = BLOCKING_LINE_STATUS[line.validation_status];
  const out: Reason[] = blocked ? [{ code: line.validation_status, message: `${line.description} ${blocked}.`, line_id: line.id }] : [];
  return INVOICE_SKIP.has(line.validation_status) ? out : [...out, ...mappingReasons(line, ctx)];
}

function accessReasons(access: CheckoutAccess): Reason[] {
  const out: Reason[] = [];
  if (!access.checkoutEnabled) out.push({ code: "checkout_disabled", message: "Checkout is not available yet. Your quote is saved." });
  else if (!access.publicEnabled && !access.isAdmin) out.push({ code: "checkout_admin_only", message: "Checkout is currently limited to administrators. Your quote is saved." });
  if (!access.environmentAllowed) out.push({ code: "checkout_unavailable_here", message: "Checkout is only available on the production site." });
  return out;
}

function statusReasons(quote: QuoteRow): Reason[] {
  if (quote.status === "expired") return [{ code: "expired", message: "This quote expired. Rebuild it to get current prices." }];
  if (!["confirmed", "invoiced"].includes(quote.status)) return [{ code: "not_confirmed", message: "Confirm the quote before checking out." }];
  return [];
}

function agreementReasons(ctx: CheckoutContext): Reason[] {
  return ctx.agreements
    .filter((a) => !a.satisfied)
    .map((g) => ({ code: g.needs_staff_review ? "agreement_unverified" : "agreement_missing", message: g.message ?? "A required agreement is missing." }));
}

interface BillingProfile {
  email: string;
  name: string;
  phone: string | undefined;
  billAddr: { line1: string; city: string; state: string; postalCode: string };
}

/** Everything QuickBooks needs to place the customer and compute tax, or null. */
function billingProfile(p: CustomerProfile): BillingProfile | null {
  if (!p.email || !p.address || !p.city || !p.state || !p.zip) return null;
  return { email: p.email, name: p.full_name || p.email, phone: p.phone ?? undefined, billAddr: { line1: p.address, city: p.city, state: p.state, postalCode: p.zip } };
}

/** Pure assessment of every checkout gate. Never calls QuickBooks. */
export function assessCheckout(quote: QuoteRow, lines: QuoteLineRow[], ctx: CheckoutContext, access: CheckoutAccess): CheckoutReadiness {
  const reasons: Reason[] = [...accessReasons(access), ...statusReasons(quote)];
  for (const l of lines) reasons.push(...lineReasons(l, ctx));
  reasons.push(...agreementReasons(ctx));
  if (!billingProfile(ctx.profile)) reasons.push({ code: "billing_address_missing", message: "Add your billing address to your profile so tax can be calculated on the invoice." });
  if (!lines.some((l) => !INVOICE_SKIP.has(l.validation_status))) reasons.push({ code: "nothing_to_invoice", message: "There is nothing to invoice on this quote." });
  const intakeQty = lines.filter((l) => l.validation_status === "location_intake").reduce((n, l) => n + l.quantity, 0);
  return { available: reasons.length === 0, blocked_reasons: reasons, location_intake_quantity: intakeQty };
}

export type CheckoutOutcome =
  | { outcome: "changed"; bundle: QuoteBundle }
  | { outcome: "blocked"; readiness: CheckoutReadiness }
  | { outcome: "invoiced"; quote: QuoteRow; pay_url: string | null };

/** Deterministic per quote version: the same click twice yields the same key and DocNumber. */
export const idempotencyKeyFor = (quote: QuoteRow) => `vq:${quote.id}:v${quote.version}`;
export const docNumberFor = (quote: QuoteRow) => `${quote.quote_number}-V${quote.version}`;

async function lockForCheckout(quote: QuoteRow): Promise<QuoteRow> {
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ status: "checkout_pending", checkout_status: "none", checkout_idempotency_key: idempotencyKeyFor(quote), checkout_started_at: new Date().toISOString() })
    .eq("id", quote.id)
    .eq("status", "confirmed")
    .eq("version", quote.version)
    .select("id, version, quote_number")
    .maybeSingle();
  if (error || !data) throw new QuoteError("quote_locked", "This quote is already being checked out or has changed. Refresh and try again.");
  return quote;
}

function invoiceLines(lines: QuoteLineRow[], ctx: CheckoutContext) {
  return lines
    .filter((l) => !INVOICE_SKIP.has(l.validation_status))
    .map((l) => ({
      description: l.description,
      unitPrice: l.unit_price,
      quantity: l.quantity,
      qbItemId: (l.catalog_item_id ? ctx.catalog.get(l.catalog_item_id)?.qb_item_id : ctx.coffeeQbItems.get(l.coffee_product_id ?? "")) ?? "",
    }));
}

async function revertToConfirmed(quoteId: string): Promise<void> {
  await supabaseAdmin.from("commerce_quotes").update({ status: "confirmed", checkout_status: "failed" }).eq("id", quoteId);
}

function normalizeQuote(data: Record<string, unknown>): QuoteRow {
  return { ...(data as unknown as QuoteRow), subtotal: Number(data.subtotal), total: Number(data.total) };
}

async function recordInvoice(quoteId: string, ids: { customerId: string; invoiceId: string; docNumber: string | null; payUrl: string | null }): Promise<QuoteRow> {
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ status: "invoiced", qb_customer_id: ids.customerId, qb_invoice_id: ids.invoiceId, qb_invoice_doc_number: ids.docNumber, qb_invoice_status: "sent", checkout_status: ids.payUrl ? "link_issued" : "failed", checkout_url: ids.payUrl })
    .eq("id", quoteId)
    .select("*")
    .single();
  if (error || !data) throw new QuoteError("upstream_error", "The invoice was created but could not be recorded. Please contact support with your quote number.");
  return normalizeQuote(data as Record<string, unknown>);
}

async function createQuoteInvoice(qbo: VinnieQuickBooks, quote: QuoteRow, lines: QuoteLineRow[], ctx: CheckoutContext): Promise<QuoteRow> {
  const billing = billingProfile(ctx.profile);
  if (!billing) throw new QuoteError("checkout_blocked", "Add your billing address to your profile before checking out.");
  const customer = await qbo.findOrCreateCustomer({ displayName: billing.name, email: billing.email, phone: billing.phone });
  const invoice = await qbo.createInvoice({
    customerId: customer.Id,
    customerEmail: billing.email,
    billAddr: billing.billAddr,
    lines: invoiceLines(lines, ctx),
    docNumber: docNumberFor(quote),
    memo: `Vending Connector quote ${quote.quote_number}`,
    privateNote: { type: "vinnie_quote", quote_id: quote.id, quote_version: String(quote.version) },
  });
  await qbo.sendInvoiceEmail(invoice.Id, billing.email).catch((e) => console.warn("[commerce/checkout] invoice email failed (non-fatal):", e instanceof Error ? e.message : e));
  const payUrl = await qbo.getHostedInvoiceLink(invoice.Id).catch(() => null);
  return recordInvoice(quote.id, { customerId: customer.Id, invoiceId: invoice.Id, docNumber: invoice.DocNumber, payUrl });
}

/** Idempotent re-entry: an already-invoiced version returns its stored link. */
async function existingInvoiceOutcome(quote: QuoteRow, access: CheckoutAccess): Promise<CheckoutOutcome | null> {
  if (quote.status !== "invoiced" || !quote.qb_invoice_id) return null;
  if (quote.checkout_url || !access.environmentAllowed) return { outcome: "invoiced", quote, pay_url: quote.checkout_url };
  const fresh = await createVinnieQuickBooks().getHostedInvoiceLink(quote.qb_invoice_id).catch(() => null);
  if (fresh) await supabaseAdmin.from("commerce_quotes").update({ checkout_url: fresh, checkout_status: "link_issued" }).eq("id", quote.id);
  return { outcome: "invoiced", quote, pay_url: fresh };
}

function assertCheckoutable(quote: QuoteRow, expectedVersion: number): void {
  if (quote.version !== expectedVersion) throw new QuoteError("version_mismatch", "The quote changed since you last saw it. Review it and confirm again.", { current_version: quote.version });
  if (quote.status === "expired") throw new QuoteError("checkout_blocked", "This quote expired. Rebuild it to get current prices.", { status: quote.status });
  if (quote.status !== "confirmed") throw new QuoteError("checkout_blocked", "Confirm the quote before checking out.", { status: quote.status });
}

async function convertLocked(quote: QuoteRow, bundle: QuoteBundle, ctx: CheckoutContext): Promise<CheckoutOutcome> {
  // The adapter constructor is the hard environment gate: it throws before
  // any lock or any request when this is not the production deployment.
  const qbo = createVinnieQuickBooks();
  await lockForCheckout(bundle.quote);
  try {
    const invoiced = await createQuoteInvoice(qbo, bundle.quote, bundle.lines, ctx);
    return { outcome: "invoiced", quote: invoiced, pay_url: invoiced.checkout_url };
  } catch (e) {
    await revertToConfirmed(quote.id);
    if (e instanceof QuoteError) throw e;
    console.error("[commerce/checkout] invoice creation failed:", e instanceof Error ? e.message : e);
    throw new QuoteError("upstream_error", "Checkout could not be completed right now. No invoice was created. Please try again or ask for a staff-issued invoice.");
  }
}

/**
 * Convert a confirmed quote into exactly one QuickBooks invoice for its
 * version. `expectedVersion` is the version the customer clicked on;
 * `access` is resolved by the route from flags, verified administrator
 * status, and the deployment environment.
 */
export async function checkoutQuote(quoteId: string, viewer: QuoteViewer, expectedVersion: number, access: CheckoutAccess): Promise<CheckoutOutcome> {
  const quote = await getOwnedQuote(quoteId, viewer.userId);
  const existing = await existingInvoiceOutcome(quote, access);
  if (existing) return existing;
  assertCheckoutable(quote, expectedVersion);
  const bundle = await revalidateQuote(quote, viewer);
  if (bundle.changes.length > 0 || bundle.quote.status !== "confirmed") return { outcome: "changed", bundle };
  const ctx = await loadCheckoutContext(viewer.userId, bundle.lines);
  const readiness = assessCheckout(bundle.quote, bundle.lines, ctx, access);
  if (!readiness.available) {
    await supabaseAdmin.from("commerce_quotes").update({ checkout_status: "blocked" }).eq("id", quote.id);
    return { outcome: "blocked", readiness };
  }
  return convertLocked(quote, bundle, ctx);
}

/** Readiness for display (no lock, no QuickBooks). */
export async function readinessFor(quote: QuoteRow, viewer: QuoteViewer, access: CheckoutAccess): Promise<CheckoutReadiness> {
  const lines = await listLines(quote.id);
  const ctx = await loadCheckoutContext(viewer.userId, lines);
  return assessCheckout(quote, lines, ctx, access);
}

// ─── Status reconciliation (owner-initiated, read-only lookup) ─────────

export const STATUS_RECONCILE_MIN_INTERVAL_MS = 60_000;
const RECONCILABLE = new Set(["invoiced", "checkout_pending"]);

export type ReconcileOutcome =
  | { outcome: "paid"; quote: QuoteRow }
  | { outcome: "unpaid"; quote: QuoteRow; balance: number }
  | { outcome: "not_applicable"; quote: QuoteRow }
  | { outcome: "unavailable"; quote: QuoteRow; reason: string }
  | { outcome: "throttled"; quote: QuoteRow; retry_after_seconds: number };

async function stampReconciled(quoteId: string, userId: string, extra: Record<string, unknown> = {}): Promise<QuoteRow> {
  const { data, error } = await supabaseAdmin
    .from("commerce_quotes")
    .update({ status_reconciled_at: new Date().toISOString(), ...extra })
    .eq("id", quoteId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) throw new QuoteError("upstream_error", "The quote status could not be updated.");
  return normalizeQuote(data as Record<string, unknown>);
}

/**
 * Looks up the quote's stored invoice through the production-only
 * adapter and marks only this owned quote paid when QuickBooks reports a
 * zero balance. Never touches the global webhook, other quotes, or any
 * other table. Throttled per quote through status_reconciled_at.
 */
function throttleFor(quote: QuoteRow, now: Date): number | null {
  const last = quote.status_reconciled_at;
  const elapsed = last ? now.getTime() - new Date(last).getTime() : Number.POSITIVE_INFINITY;
  return elapsed < STATUS_RECONCILE_MIN_INTERVAL_MS ? Math.ceil((STATUS_RECONCILE_MIN_INTERVAL_MS - elapsed) / 1000) : null;
}

async function applyInvoiceStatus(quote: QuoteRow, viewer: QuoteViewer, invoiceId: string, now: Date): Promise<ReconcileOutcome> {
  const invoice = await createVinnieQuickBooks().getInvoiceStatus(invoiceId);
  if (invoice.TotalAmt > 0 && invoice.Balance <= 0) {
    const paid = await stampReconciled(quote.id, viewer.userId, { status: "paid", checkout_status: "paid", qb_invoice_status: "paid", checkout_completed_at: now.toISOString() });
    return { outcome: "paid", quote: paid };
  }
  const refreshed = await stampReconciled(quote.id, viewer.userId);
  return { outcome: "unpaid", quote: refreshed, balance: invoice.Balance };
}

export async function reconcileQuoteStatus(quoteId: string, viewer: QuoteViewer, now: Date = new Date()): Promise<ReconcileOutcome> {
  const quote = await getOwnedQuote(quoteId, viewer.userId);
  if (!RECONCILABLE.has(quote.status) || !quote.qb_invoice_id) return { outcome: "not_applicable", quote };
  const retry = throttleFor(quote, now);
  if (retry !== null) return { outcome: "throttled", quote, retry_after_seconds: retry };
  const gate = vinnieQuickBooksGate();
  if (!gate.allowed) return { outcome: "unavailable", quote, reason: gate.reason ?? "unavailable" };
  return applyInvoiceStatus(quote, viewer, quote.qb_invoice_id, now);
}
