/**
 * Workflows — payment sync helpers.
 *
 * When a payment lands on any source object that a workflow tracks
 * (sales_orders, coffee_orders, machine_listing_purchases, or the
 * workflow's own balance invoice), we mirror the payment state onto
 * workflows.payment_status + workflows.deposit_paid_cents.
 *
 * Every helper is idempotent — safe to call repeatedly on the same
 * source. Uses the workflow_events audit log to record the sync so
 * duplicate webhook fires stay traceable.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { recordEvent } from "./service";

/**
 * Mark any workflow(s) linked to this sales_order as paid.
 */
export async function syncWorkflowFromSalesOrderPaid(args: {
  orderId: string;
  amountCents?: number;
  source: string;
  changeKey?: string;
}): Promise<number> {
  const { data: workflows } = await supabaseAdmin
    .from("workflows")
    .select("id, payment_status, deposit_paid_cents, total_due_cents, version")
    .eq("order_id", args.orderId);

  let updated = 0;
  for (const w of workflows ?? []) {
    if (w.payment_status === "paid") continue;
    const patch: Record<string, unknown> = {
      payment_status: "paid",
      version: (w.version ?? 1) + 1,
    };
    if (args.amountCents != null) {
      patch.deposit_paid_cents = Math.max(Number(w.deposit_paid_cents ?? 0), args.amountCents);
    } else if (w.total_due_cents != null && Number(w.total_due_cents) > 0) {
      patch.deposit_paid_cents = Number(w.total_due_cents);
    }
    const { error } = await supabaseAdmin
      .from("workflows")
      .update(patch)
      .eq("id", w.id)
      .eq("version", w.version);
    if (!error) {
      updated += 1;
      await recordEvent({
        workflowId: w.id,
        eventType: "payment_synced",
        previousValue: { payment_status: w.payment_status },
        newValue: { payment_status: "paid", source_order_id: args.orderId },
        actorType: "webhook",
        source: args.source,
        changeKey: args.changeKey,
      });
    }
  }
  return updated;
}

/**
 * Mark a coffee_order's workflow_order_items sub-item as fulfilled
 * (used when the QB webhook confirms the coffee order paid).
 */
export async function syncCoffeeOrderPaid(args: {
  coffeeOrderId: string;
  source: string;
  changeKey?: string;
}): Promise<number> {
  const { data: items } = await supabaseAdmin
    .from("workflow_order_items")
    .select("id, workflow_id, fulfillment_status")
    .eq("external_order_id", args.coffeeOrderId)
    .eq("external_order_type", "coffee_order");

  let updated = 0;
  for (const item of items ?? []) {
    if (item.fulfillment_status === "fulfilled" || item.fulfillment_status === "cancelled") continue;
    const { error } = await supabaseAdmin
      .from("workflow_order_items")
      .update({
        fulfillment_status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (!error) {
      updated += 1;
      await recordEvent({
        workflowId: item.workflow_id,
        eventType: "order_item_paid",
        newValue: { coffee_order_id: args.coffeeOrderId, item_id: item.id },
        actorType: "webhook",
        source: args.source,
        changeKey: args.changeKey,
      });
    }
  }
  return updated;
}

/**
 * When a QB invoice ID that was created via
 * /api/account/workflows/[id]/pay-balance gets paid, find the workflow
 * that stashed that invoice ID and mark it paid.
 */
export async function syncWorkflowFromBalanceInvoicePaid(args: {
  qbInvoiceId: string;
  amountCents?: number;
  source: string;
  changeKey?: string;
}): Promise<number> {
  // Postgres JSON containment: find any workflow whose metadata contains
  // { balance_qb_invoice_id: <id> }.
  const { data: workflows } = await supabaseAdmin
    .from("workflows")
    .select("id, payment_status, deposit_paid_cents, total_due_cents, version, metadata")
    .contains("metadata", { balance_qb_invoice_id: args.qbInvoiceId });

  let updated = 0;
  for (const w of workflows ?? []) {
    if (w.payment_status === "paid") continue;
    const patch: Record<string, unknown> = {
      payment_status: "paid",
      version: (w.version ?? 1) + 1,
      deposit_paid_cents: w.total_due_cents != null && Number(w.total_due_cents) > 0
        ? Number(w.total_due_cents)
        : Math.max(Number(w.deposit_paid_cents ?? 0), args.amountCents ?? 0),
    };
    const { error } = await supabaseAdmin
      .from("workflows")
      .update(patch)
      .eq("id", w.id)
      .eq("version", w.version);
    if (!error) {
      updated += 1;
      await recordEvent({
        workflowId: w.id,
        eventType: "balance_paid",
        previousValue: { payment_status: w.payment_status },
        newValue: { payment_status: "paid", qb_invoice_id: args.qbInvoiceId },
        actorType: "webhook",
        source: args.source,
        changeKey: args.changeKey,
      });
    }
  }
  return updated;
}

/**
 * Mark a machine_listing_purchase's workflow as paid.
 */
export async function syncWorkflowFromMachinePurchasePaid(args: {
  purchaseId: string;
  source: string;
  changeKey?: string;
}): Promise<number> {
  const { data: workflows } = await supabaseAdmin
    .from("workflows")
    .select("id, payment_status, version")
    .eq("purchase_id", args.purchaseId);

  let updated = 0;
  for (const w of workflows ?? []) {
    if (w.payment_status === "paid") continue;
    const { error } = await supabaseAdmin
      .from("workflows")
      .update({ payment_status: "paid", version: (w.version ?? 1) + 1 })
      .eq("id", w.id)
      .eq("version", w.version);
    if (!error) {
      updated += 1;
      await recordEvent({
        workflowId: w.id,
        eventType: "payment_synced",
        previousValue: { payment_status: w.payment_status },
        newValue: { payment_status: "paid", source_purchase_id: args.purchaseId },
        actorType: "webhook",
        source: args.source,
        changeKey: args.changeKey,
      });
    }
  }
  return updated;
}
