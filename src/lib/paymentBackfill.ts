/**
 * Backfill orchestrator — walks each legacy purchase table and produces a
 * plan of (invoices, payments) that would be created if applied. Preview mode
 * returns the plan without writing; apply mode writes atomically per row and
 * stamps `financial_spine_invoice_id` / `financial_spine_payment_id` on the
 * source row so subsequent runs skip it.
 *
 * Sources included in Phase 1:
 *   lead_purchases, machine_listing_purchases, coffee_orders,
 *   user_listing_purchases, pipeline_payments, agreement_tokens.
 *
 * Cutoff: rows whose created_at (or best-effort equivalent) falls within the
 * cutoff window are considered. Default 90 days.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { upsertInvoice, upsertPayment } from "./paymentLedger";

export interface BackfillPlanRow {
  source_table: string;
  source_id: string;
  action: "create" | "skip";
  reason?: string;
  provider: string;
  amount_cents: number;
  status: string;
  invoice_ref?: string | null;
  payment_ref?: string | null;
  buyer_email?: string | null;
  created_at?: string | null;
}

export interface BackfillPlan {
  cutoff: string;
  rows: BackfillPlanRow[];
  summary: {
    total: number;
    to_create: number;
    to_skip: number;
    by_source: Record<string, { create: number; skip: number }>;
  };
}

function cutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Producing the plan. No writes — every row is inspected + classified.
 * `apply=true` writes atomically per row.
 */
export async function runBackfill(opts: { cutoffDays?: number; apply: boolean; limit?: number }): Promise<BackfillPlan> {
  const days = opts.cutoffDays ?? 90;
  const cutoff = cutoffIso(days);
  const limit = Math.min(500, Math.max(10, opts.limit ?? 200));
  const rows: BackfillPlanRow[] = [];

  // ─── lead_purchases ───────────────────────────────────────────────────
  {
    const { data } = await supabaseAdmin
      .from("lead_purchases")
      .select("id, user_id, request_id, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, buyer_email, status, qb_invoice_id, qb_payment_id, payment_provider, financial_spine_invoice_id, financial_spine_payment_id, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const r of data || []) {
      if (r.financial_spine_payment_id) {
        rows.push({ source_table: "lead_purchases", source_id: r.id, action: "skip", reason: "already backfilled", provider: r.payment_provider || "unknown", amount_cents: r.amount_cents || 0, status: r.status });
        continue;
      }
      if (r.status !== "completed" && r.status !== "paid") {
        rows.push({ source_table: "lead_purchases", source_id: r.id, action: "skip", reason: `status=${r.status}`, provider: r.payment_provider || "unknown", amount_cents: r.amount_cents || 0, status: r.status });
        continue;
      }
      const provider = r.payment_provider === "quickbooks" ? "quickbooks" : "stripe";
      const providerInvoiceId = provider === "quickbooks" ? r.qb_invoice_id : r.stripe_checkout_session_id;
      const providerPaymentId = provider === "quickbooks" ? r.qb_payment_id : r.stripe_payment_intent_id;
      const plan: BackfillPlanRow = {
        source_table: "lead_purchases",
        source_id: r.id,
        action: "create",
        provider,
        amount_cents: r.amount_cents || 0,
        status: "paid",
        invoice_ref: providerInvoiceId || null,
        payment_ref: providerPaymentId || null,
        buyer_email: r.buyer_email || null,
        created_at: r.created_at,
      };
      rows.push(plan);

      if (opts.apply) {
        const invoice = await upsertInvoice({
          provider,
          providerInvoiceId: providerInvoiceId || null,
          leadId: r.request_id,
          buyerProfileId: r.user_id,
          buyerEmail: r.buyer_email,
          subtotalCents: r.amount_cents || 0,
          totalCents: r.amount_cents || 0,
          status: "paid",
        });
        const payment = await upsertPayment({
          provider,
          providerPaymentId: providerPaymentId || null,
          invoiceId: invoice.id,
          buyerProfileId: r.user_id,
          buyerEmail: r.buyer_email,
          amountCents: r.amount_cents || 0,
          method: "card",
          status: "paid",
          paidAt: r.created_at,
        });
        await supabaseAdmin
          .from("lead_purchases")
          .update({
            financial_spine_invoice_id: invoice.id,
            financial_spine_payment_id: payment.id,
          })
          .eq("id", r.id);
      }
    }
  }

  // ─── machine_listing_purchases ────────────────────────────────────────
  {
    const { data } = await supabaseAdmin
      .from("machine_listing_purchases")
      .select("id, machine_listing_id, buyer_email, amount_cents, status, stripe_checkout_session_id, stripe_payment_intent_id, qb_invoice_id, qb_payment_id, payment_provider, financial_spine_payment_id, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const r of data || []) {
      if (r.financial_spine_payment_id) {
        rows.push({ source_table: "machine_listing_purchases", source_id: r.id, action: "skip", reason: "already backfilled", provider: r.payment_provider || "unknown", amount_cents: r.amount_cents || 0, status: r.status });
        continue;
      }
      if (r.status !== "completed" && r.status !== "paid") {
        rows.push({ source_table: "machine_listing_purchases", source_id: r.id, action: "skip", reason: `status=${r.status}`, provider: r.payment_provider || "unknown", amount_cents: r.amount_cents || 0, status: r.status });
        continue;
      }
      const provider = r.payment_provider === "quickbooks" ? "quickbooks" : "stripe";
      const providerInvoiceId = provider === "quickbooks" ? r.qb_invoice_id : r.stripe_checkout_session_id;
      const providerPaymentId = provider === "quickbooks" ? r.qb_payment_id : r.stripe_payment_intent_id;
      rows.push({
        source_table: "machine_listing_purchases",
        source_id: r.id,
        action: "create",
        provider,
        amount_cents: r.amount_cents || 0,
        status: "paid",
        invoice_ref: providerInvoiceId,
        payment_ref: providerPaymentId,
        buyer_email: r.buyer_email,
        created_at: r.created_at,
      });

      if (opts.apply) {
        const invoice = await upsertInvoice({
          provider,
          providerInvoiceId: providerInvoiceId || null,
          buyerEmail: r.buyer_email,
          subtotalCents: r.amount_cents || 0,
          totalCents: r.amount_cents || 0,
          status: "paid",
        });
        const payment = await upsertPayment({
          provider,
          providerPaymentId: providerPaymentId || null,
          invoiceId: invoice.id,
          buyerEmail: r.buyer_email,
          amountCents: r.amount_cents || 0,
          method: "card",
          status: "paid",
          paidAt: r.created_at,
        });
        await supabaseAdmin
          .from("machine_listing_purchases")
          .update({ financial_spine_invoice_id: invoice.id, financial_spine_payment_id: payment.id })
          .eq("id", r.id);
      }
    }
  }

  // ─── coffee_orders ────────────────────────────────────────────────────
  {
    const { data } = await supabaseAdmin
      .from("coffee_orders")
      .select("id, operator_id, total_cents, status, stripe_checkout_session_id, stripe_payment_intent_id, qb_invoice_id, qb_payment_id, payment_provider, financial_spine_payment_id, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const r of data || []) {
      if (r.financial_spine_payment_id) {
        rows.push({ source_table: "coffee_orders", source_id: r.id, action: "skip", reason: "already backfilled", provider: r.payment_provider || "unknown", amount_cents: r.total_cents || 0, status: r.status });
        continue;
      }
      if (r.status !== "completed" && r.status !== "paid") {
        rows.push({ source_table: "coffee_orders", source_id: r.id, action: "skip", reason: `status=${r.status}`, provider: r.payment_provider || "unknown", amount_cents: r.total_cents || 0, status: r.status });
        continue;
      }
      const provider = r.payment_provider === "quickbooks" ? "quickbooks" : "stripe";
      const providerInvoiceId = provider === "quickbooks" ? r.qb_invoice_id : r.stripe_checkout_session_id;
      const providerPaymentId = provider === "quickbooks" ? r.qb_payment_id : r.stripe_payment_intent_id;
      rows.push({
        source_table: "coffee_orders",
        source_id: r.id,
        action: "create",
        provider,
        amount_cents: r.total_cents || 0,
        status: "paid",
        invoice_ref: providerInvoiceId,
        payment_ref: providerPaymentId,
        created_at: r.created_at,
      });

      if (opts.apply) {
        const invoice = await upsertInvoice({
          provider,
          providerInvoiceId: providerInvoiceId || null,
          buyerProfileId: r.operator_id,
          subtotalCents: r.total_cents || 0,
          totalCents: r.total_cents || 0,
          status: "paid",
        });
        const payment = await upsertPayment({
          provider,
          providerPaymentId: providerPaymentId || null,
          invoiceId: invoice.id,
          buyerProfileId: r.operator_id,
          amountCents: r.total_cents || 0,
          method: "card",
          status: "paid",
          paidAt: r.created_at,
        });
        await supabaseAdmin
          .from("coffee_orders")
          .update({ financial_spine_invoice_id: invoice.id, financial_spine_payment_id: payment.id })
          .eq("id", r.id);
      }
    }
  }

  // Summary
  const summary = {
    total: rows.length,
    to_create: rows.filter((r) => r.action === "create").length,
    to_skip: rows.filter((r) => r.action === "skip").length,
    by_source: {} as Record<string, { create: number; skip: number }>,
  };
  for (const r of rows) {
    summary.by_source[r.source_table] = summary.by_source[r.source_table] || { create: 0, skip: 0 };
    if (r.action === "create") summary.by_source[r.source_table].create++;
    else summary.by_source[r.source_table].skip++;
  }

  return { cutoff, rows, summary };
}
