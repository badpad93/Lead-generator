/**
 * Coffee-order invoice recovery.
 *
 * Both the scheduled sweep (/api/cron/coffee-invoice-sweep) and the
 * admin one-shot (/api/admin/coffee/orders/[id]/retry-invoice) share
 * this core so the double-invoice safety and retry accounting stay
 * in one place — the risk in this whole feature is a duplicate
 * bill, so it deserves one code path.
 *
 * The double-invoice safety works because:
 *
 *   1. On the original checkout, createInvoice was called with
 *      docNumber = order.order_number (VC-{timestamp}, unique per
 *      company). If Intuit did create the invoice before our
 *      function timed out, that invoice has DocNumber = order_number
 *      on Intuit's side even though our qb_invoice_id is still NULL.
 *
 *   2. attemptInvoiceForOrder queries QBO first via
 *      findInvoiceByDocNumber(order.order_number). If it finds the
 *      orphaned invoice, we adopt its Id — no create call, no
 *      duplicate.
 *
 *   3. If the pre-check errors (returns null due to a network blip)
 *      the create call is still safe because we ALSO pass
 *      docNumber = order.order_number, and QBO's 6140 "Duplicate
 *      Document Number" error is caught in createInvoice which
 *      then does the same lookup and returns the existing invoice.
 *      Belt-and-suspenders.
 *
 *   4. If BOTH the pre-check and the 6140 lookup fail (Intuit is
 *      thoroughly down), the create throws — attempts counter still
 *      bumps, but no duplicate can be written because Intuit never
 *      accepted the second create.
 *
 * The sweep additionally short-circuits via pingQuickBooks() before
 * iterating candidates, so an Intuit outage is one 15s timeout
 * total instead of one per order.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  createInvoice,
  findInvoiceByDocNumber,
  getInvoice,
  sendInvoiceEmail,
  QbTimeoutError,
} from "@/lib/quickbooks";

export const INVOICE_RETRY_CAP = 6;
export const INVOICE_RETRY_MIN_GAP_MS = 5 * 60 * 1000;
export const INVOICE_RETRY_AGE_MS = 10 * 60 * 1000;

export type AttemptOutcome =
  | { outcome: "adopted"; qbInvoiceId: string; invoiceLink: string | null }
  | { outcome: "created"; qbInvoiceId: string; invoiceLink: string | null }
  | { outcome: "skipped_recent"; reason: string }
  | { outcome: "skipped_cap"; reason: string }
  | { outcome: "failed_timeout"; reason: string }
  | { outcome: "failed_other"; reason: string };

interface CandidateOrder {
  id: string;
  order_number: string;
  operator_id: string;
  billing_email: string | null;
  billing_contact_name: string | null;
  invoice_retry_attempts: number;
  invoice_last_attempt_at: string | null;
  subtotal: number | null;
  shipping_estimate: number | null;
  total: number | null;
}

async function loadOrder(orderId: string): Promise<CandidateOrder | null> {
  const { data } = await supabaseAdmin
    .from("coffee_orders")
    .select(
      "id, order_number, operator_id, billing_email, billing_contact_name, invoice_retry_attempts, invoice_last_attempt_at, subtotal, shipping_estimate, total",
    )
    .eq("id", orderId)
    .maybeSingle();
  return (data as CandidateOrder | null) ?? null;
}

async function loadOrderItems(orderId: string) {
  const { data } = await supabaseAdmin
    .from("coffee_order_items")
    .select("product_name, product_sku, quantity, unit_price, shipping_cost")
    .eq("order_id", orderId);
  return (data ?? []) as Array<{
    product_name: string;
    product_sku: string;
    quantity: number;
    unit_price: number;
    shipping_cost: number | null;
  }>;
}

async function loadOperator(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return (data as { id: string; full_name: string | null; email: string | null } | null) ?? null;
}

async function stampAttempt(orderId: string): Promise<number | null> {
  // Read current attempts, increment, write both attempts and
  // last_attempt_at. Not atomic across sessions but the sweep is
  // single-writer (one cron process) and admin retries are rare —
  // an occasional off-by-one on the counter is acceptable, this
  // is defense in depth not the double-invoice check.
  const { data: current } = await supabaseAdmin
    .from("coffee_orders")
    .select("invoice_retry_attempts")
    .eq("id", orderId)
    .maybeSingle();
  const prev = (current as { invoice_retry_attempts: number | null } | null)?.invoice_retry_attempts ?? 0;
  const next = prev + 1;
  await supabaseAdmin
    .from("coffee_orders")
    .update({ invoice_retry_attempts: next, invoice_last_attempt_at: new Date().toISOString() })
    .eq("id", orderId);
  return next;
}

export interface AttemptOptions {
  respectCap: boolean;
  respectGap: boolean;
}

/**
 * Attempt to (adopt or create) the QBO invoice for one order.
 * Returns a typed outcome; never throws.
 *
 * The sweep passes { respectCap: true, respectGap: true } so orders
 * that just retried or are already at the cap are left alone. The
 * admin retry passes { respectCap: false, respectGap: false } —
 * that's the whole point of the manual override.
 */
export async function attemptInvoiceForOrder(
  orderId: string,
  opts: AttemptOptions,
): Promise<AttemptOutcome> {
  const order = await loadOrder(orderId);
  if (!order) {
    return { outcome: "failed_other", reason: `Order ${orderId} not found` };
  }

  if (opts.respectCap && (order.invoice_retry_attempts ?? 0) >= INVOICE_RETRY_CAP) {
    return {
      outcome: "skipped_cap",
      reason: `attempts=${order.invoice_retry_attempts} cap=${INVOICE_RETRY_CAP}`,
    };
  }
  if (
    opts.respectGap &&
    order.invoice_last_attempt_at &&
    Date.now() - new Date(order.invoice_last_attempt_at).getTime() < INVOICE_RETRY_MIN_GAP_MS
  ) {
    return {
      outcome: "skipped_recent",
      reason: `last_attempt_at=${order.invoice_last_attempt_at}`,
    };
  }

  const operator = await loadOperator(order.operator_id);
  const items = await loadOrderItems(order.id);
  if (items.length === 0) {
    return { outcome: "failed_other", reason: "No line items on order" };
  }

  await stampAttempt(order.id);

  // Double-invoice safety: query QBO for a prior invoice with this
  // DocNumber before we create anything.
  let adopted: Awaited<ReturnType<typeof findInvoiceByDocNumber>> = null;
  try {
    adopted = await findInvoiceByDocNumber(order.order_number);
  } catch (err) {
    if (err instanceof QbTimeoutError) {
      await recordFailure(order.id, "QbTimeoutError on pre-check");
      return { outcome: "failed_timeout", reason: (err as Error).message };
    }
    // Any other lookup error — the safe move is to bail rather than
    // risk a double-invoice. Admin can retry.
    const msg = err instanceof Error ? err.message : String(err);
    await recordFailure(order.id, `Pre-check failed: ${msg}`);
    return { outcome: "failed_other", reason: `Pre-check failed: ${msg}` };
  }

  if (adopted) {
    // Orphaned invoice found — adopt without creating.
    await supabaseAdmin
      .from("coffee_orders")
      .update({
        qb_invoice_id: adopted.Id,
        payment_provider: "quickbooks",
        invoice_retry_failed_reason: null,
      })
      .eq("id", order.id);
    // Best-effort resend of the invoice email so the customer gets
    // the pay-now link. Never blocks the adopt.
    if (order.billing_email) {
      try {
        await sendInvoiceEmail(adopted.Id, order.billing_email);
      } catch (e) {
        console.warn("[coffee-invoice-retry] adopted invoice email failed:", e);
      }
    }
    const link = await tryFetchInvoiceLink(adopted.Id);
    return { outcome: "adopted", qbInvoiceId: adopted.Id, invoiceLink: link };
  }

  // No orphan — create it. Line items:
  const lineItems = items.map((i) => ({
    description: `${i.product_name} (SKU: ${i.product_sku})`,
    amount: Number(i.unit_price),
    quantity: Number(i.quantity),
  }));
  const shipping = Number(order.shipping_estimate ?? 0);
  if (shipping > 0) {
    lineItems.push({ description: "Shipping", amount: shipping, quantity: 1 });
  }

  const email = order.billing_email ?? operator?.email ?? "";
  const name = order.billing_contact_name ?? operator?.full_name ?? email ?? "Customer";

  let invoice: Awaited<ReturnType<typeof createInvoice>>;
  try {
    invoice = await createInvoice({
      customerEmail: email,
      customerName: name,
      lineItems,
      memo: `Coffee order ${order.order_number}`,
      metadata: {
        type: "coffee_order",
        order_id: order.id,
        order_number: order.order_number,
        user_id: order.operator_id,
        retry_source: opts.respectCap ? "sweep" : "admin",
      },
      docNumber: order.order_number,
    });
  } catch (err) {
    if (err instanceof QbTimeoutError) {
      await recordFailure(order.id, "QbTimeoutError on create");
      return { outcome: "failed_timeout", reason: (err as Error).message };
    }
    const msg = err instanceof Error ? err.message : String(err);
    await recordFailure(order.id, msg);
    return { outcome: "failed_other", reason: msg };
  }

  await supabaseAdmin
    .from("coffee_orders")
    .update({
      qb_invoice_id: invoice.Id,
      payment_provider: "quickbooks",
      invoice_retry_failed_reason: null,
    })
    .eq("id", order.id);

  if (email) {
    try {
      await sendInvoiceEmail(invoice.Id, email);
    } catch (e) {
      console.warn("[coffee-invoice-retry] created invoice email failed:", e);
    }
  }
  const link = await tryFetchInvoiceLink(invoice.Id);
  return { outcome: "created", qbInvoiceId: invoice.Id, invoiceLink: link };
}

async function tryFetchInvoiceLink(invoiceId: string): Promise<string | null> {
  try {
    const full = await getInvoice(invoiceId);
    return full.InvoiceLink ?? null;
  } catch {
    return null;
  }
}

async function recordFailure(orderId: string, reason: string): Promise<void> {
  await supabaseAdmin
    .from("coffee_orders")
    .update({ invoice_retry_failed_reason: reason.slice(0, 240) })
    .eq("id", orderId);
}

export interface SweepSummary {
  scanned: number;
  adopted: number;
  created: number;
  skipped: number;
  failed_timeout: number;
  failed_other: number;
  ping_failed: boolean;
  duration_ms: number;
  order_ids: string[];
}

/**
 * Sweep candidate orders. Runs the canary first; on QbTimeoutError
 * from the canary, returns immediately with ping_failed=true and
 * touches no orders. On the per-order path, a single QbTimeoutError
 * ALSO short-circuits the loop — we assume Intuit has degraded and
 * further attempts would just accumulate timeouts.
 */
export async function runInvoiceRetrySweep(): Promise<SweepSummary> {
  const started = Date.now();
  const summary: SweepSummary = {
    scanned: 0,
    adopted: 0,
    created: 0,
    skipped: 0,
    failed_timeout: 0,
    failed_other: 0,
    ping_failed: false,
    duration_ms: 0,
    order_ids: [],
  };

  const { pingQuickBooks } = await import("@/lib/quickbooks");
  try {
    await pingQuickBooks();
  } catch (err) {
    if (err instanceof QbTimeoutError) {
      summary.ping_failed = true;
      summary.duration_ms = Date.now() - started;
      console.warn("[coffee-invoice-retry-sweep] canary timed out; aborting run");
      return summary;
    }
    // Non-timeout ping failure (auth expired etc.) — also skip.
    summary.ping_failed = true;
    summary.duration_ms = Date.now() - started;
    console.warn("[coffee-invoice-retry-sweep] canary failed; aborting:", err);
    return summary;
  }

  const cutoffIso = new Date(Date.now() - INVOICE_RETRY_AGE_MS).toISOString();
  const gapCutoffIso = new Date(Date.now() - INVOICE_RETRY_MIN_GAP_MS).toISOString();

  const { data: candidatesRaw } = await supabaseAdmin
    .from("coffee_orders")
    .select("id")
    .eq("status", "awaiting_payment")
    .is("qb_invoice_id", null)
    .lt("created_at", cutoffIso)
    .lt("invoice_retry_attempts", INVOICE_RETRY_CAP)
    .or(`invoice_last_attempt_at.is.null,invoice_last_attempt_at.lt.${gapCutoffIso}`)
    .order("created_at", { ascending: true })
    .limit(50);
  const candidates = (candidatesRaw ?? []) as Array<{ id: string }>;

  for (const c of candidates) {
    summary.scanned += 1;
    summary.order_ids.push(c.id);
    const res = await attemptInvoiceForOrder(c.id, { respectCap: true, respectGap: true });
    switch (res.outcome) {
      case "adopted":
        summary.adopted += 1;
        break;
      case "created":
        summary.created += 1;
        break;
      case "skipped_recent":
      case "skipped_cap":
        summary.skipped += 1;
        break;
      case "failed_timeout":
        summary.failed_timeout += 1;
        // Bail — Intuit is likely degraded again.
        summary.duration_ms = Date.now() - started;
        console.warn(
          "[coffee-invoice-retry-sweep] per-order timeout; aborting rest of sweep",
        );
        return summary;
      case "failed_other":
        summary.failed_other += 1;
        break;
    }
  }

  summary.duration_ms = Date.now() - started;
  return summary;
}
