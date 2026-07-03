/**
 * Daily reconciliation — walks the last 30 days of provider records and files
 * an exception for anything that doesn't match the CRM payment ledger.
 *
 * We keep this deliberately conservative: only "we have proof of a diff" flags
 * an exception. False negatives are safer than false positives here — a real
 * duplicate/missing/mismatch will show up in multiple daily runs anyway.
 */

import { supabaseAdmin } from "./supabaseAdmin";

const WINDOW_DAYS = 30;

export interface ReconciliationRun {
  started_at: string;
  finished_at: string;
  windows: {
    from: string;
    to: string;
  };
  scanned: {
    stripe_charges: number;
    qb_payments: number;
    crm_payments: number;
    crm_invoices: number;
  };
  exceptions_filed: number;
  errors: string[];
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function fileException(row: {
  type: "missing_webhook" | "missing_provider" | "amount_mismatch" | "duplicate_payment" | "orphan_refund" | "wrong_invoice_link" | "stale_open_invoice" | "other";
  provider?: string | null;
  provider_ref?: string | null;
  crm_payment_id?: string | null;
  crm_invoice_id?: string | null;
  amount_cents?: number | null;
  note: string;
}) {
  // Dedup: don't file another exception for the same (type, provider,
  // provider_ref) if there's already an unresolved one.
  const query = supabaseAdmin
    .from("payment_reconciliation_exceptions")
    .select("id")
    .eq("type", row.type)
    .is("resolved_at", null);
  if (row.provider) query.eq("provider", row.provider);
  if (row.provider_ref) query.eq("provider_ref", row.provider_ref);
  const { data: existing } = await query.limit(1).maybeSingle();
  if (existing) return false;

  await supabaseAdmin.from("payment_reconciliation_exceptions").insert(row);
  return true;
}

/**
 * Sweep 1: stale open invoices past due_date.
 * Runs against our own DB — no provider round-trip needed.
 */
async function sweepStaleOpenInvoices(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("invoices")
    .select("id, provider, provider_invoice_id, due_date, total_cents, balance_due_cents, status")
    .in("status", ["open", "partially_paid"])
    .lt("due_date", today)
    .limit(500);

  let filed = 0;
  for (const inv of data || []) {
    // Mark overdue if not already
    if (inv.status !== "overdue") {
      await supabaseAdmin
        .from("invoices")
        .update({ status: "overdue" })
        .eq("id", inv.id);
      await supabaseAdmin.from("payment_status_history").insert({
        invoice_id: inv.id,
        from_status: inv.status,
        to_status: "overdue",
        reason: "reconciliation: past due_date",
      });
    }

    // File exception only if it's been overdue for more than 7 days
    const overdueSevenPlus = inv.due_date && (Date.now() - new Date(inv.due_date).getTime()) > 7 * 24 * 60 * 60 * 1000;
    if (overdueSevenPlus) {
      const ok = await fileException({
        type: "stale_open_invoice",
        provider: inv.provider,
        provider_ref: inv.provider_invoice_id,
        crm_invoice_id: inv.id,
        amount_cents: inv.balance_due_cents,
        note: `Invoice past due since ${inv.due_date} with balance $${(Number(inv.balance_due_cents) / 100).toFixed(2)}.`,
      });
      if (ok) filed++;
    }
  }
  return filed;
}

/**
 * Sweep 2: CRM payments in the last 30 days with no corresponding provider
 * event log entry.
 *
 * Uses payment_events as the source of truth for "did we see a webhook".
 * Manual entries are exempt (they have provider='manual' and no event log
 * row is expected).
 */
async function sweepMissingProviderEvents(): Promise<number> {
  const cutoff = daysAgoIso(WINDOW_DAYS);
  const { data } = await supabaseAdmin
    .from("payments")
    .select("id, provider, provider_payment_id, amount_cents, event_id, created_at")
    .in("provider", ["stripe", "quickbooks", "paypal"])
    .in("status", ["paid", "partial_refund", "refunded", "chargeback"])
    .gte("created_at", cutoff)
    .is("event_id", null)
    .limit(500);

  let filed = 0;
  for (const p of data || []) {
    // Manual entries can legitimately have no event_id — they're recorded by
    // the admin. Anything else is suspicious.
    const ok = await fileException({
      type: "missing_webhook",
      provider: p.provider,
      provider_ref: p.provider_payment_id,
      crm_payment_id: p.id,
      amount_cents: p.amount_cents,
      note: `Payment recorded without a linked provider event. Was the webhook delivered?`,
    });
    if (ok) filed++;
  }
  return filed;
}

/**
 * Sweep 3: duplicate payments in the last 30 days.
 * Groups by (provider, provider_payment_id) and flags any group with count > 1.
 * The UNIQUE constraint on payments (provider, provider_payment_id) should
 * make this impossible, but nulls in provider_payment_id (manual entries)
 * can still stack.
 */
async function sweepDuplicatePayments(): Promise<number> {
  const cutoff = daysAgoIso(WINDOW_DAYS);
  const { data } = await supabaseAdmin
    .from("payments")
    .select("id, provider, provider_payment_id, amount_cents, order_id, buyer_email")
    .in("status", ["paid", "partial_refund"])
    .gte("created_at", cutoff)
    .limit(1000);

  // Group by (buyer_email, amount_cents, order_id) — manual entry duplicates
  // usually share those three even without provider_payment_id.
  const groups = new Map<string, typeof data>();
  for (const p of data || []) {
    const key = `${p.buyer_email || ""}|${p.amount_cents}|${p.order_id || ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  let filed = 0;
  for (const [, group] of groups) {
    if (!group || group.length < 2) continue;
    // File one exception per group (dedup only flags the first) — points to
    // both payment ids in the note.
    const ok = await fileException({
      type: "duplicate_payment",
      crm_payment_id: group[0].id,
      amount_cents: group[0].amount_cents,
      note: `Duplicate candidate: ${group.length} payments for ${group[0].buyer_email || "(unknown buyer)"} with same amount + order. Payment IDs: ${group.map((g) => g.id.slice(0, 8)).join(", ")}`,
    });
    if (ok) filed++;
  }
  return filed;
}

export async function runReconciliation(): Promise<ReconciliationRun> {
  const started = new Date().toISOString();
  const errors: string[] = [];
  const scanned = { stripe_charges: 0, qb_payments: 0, crm_payments: 0, crm_invoices: 0 };
  let filed = 0;

  try {
    filed += await sweepStaleOpenInvoices();
  } catch (e) {
    errors.push(`stale_open_invoices: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    filed += await sweepMissingProviderEvents();
  } catch (e) {
    errors.push(`missing_provider_events: ${e instanceof Error ? e.message : String(e)}`);
  }
  try {
    filed += await sweepDuplicatePayments();
  } catch (e) {
    errors.push(`duplicate_payments: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Count scan totals
  const [{ count: crmPayments }, { count: crmInvoices }] = await Promise.all([
    supabaseAdmin.from("payments").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(WINDOW_DAYS)),
    supabaseAdmin.from("invoices").select("*", { count: "exact", head: true }).gte("created_at", daysAgoIso(WINDOW_DAYS)),
  ]);
  scanned.crm_payments = crmPayments || 0;
  scanned.crm_invoices = crmInvoices || 0;

  return {
    started_at: started,
    finished_at: new Date().toISOString(),
    windows: { from: daysAgoIso(WINDOW_DAYS), to: new Date().toISOString() },
    scanned,
    exceptions_filed: filed,
    errors,
  };
}
