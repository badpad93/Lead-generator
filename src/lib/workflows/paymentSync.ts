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
 * Auto-complete the "payment lands" stage on a workflow. Runs after
 * any payment sync — idempotent, so replayed webhooks don't double-
 * advance. Looks for a stage keyed 'payment_confirmed' first
 * (location_services template's canonical name), falls back to
 * 'initial_order_placed' (coffee_service), then to the first
 * status/milestone stage — this covers custom templates whose payment
 * stage authors named something else.
 *
 * The stage is set to 'completed' and current_stage_key advances to
 * the next stage in order_index — same shape the manual update path
 * uses, so downstream notification rules (workflow.stage_completed
 * for that key) fire the customer email exactly once.
 */
export async function advancePaymentStageForWorkflow(args: {
  workflowId: string;
  source: string;
  changeKey?: string;
}): Promise<boolean> {
  const preferredKeys = ["payment_confirmed", "initial_order_placed", "deposit_received", "order_placed"];

  const { data: stages } = await supabaseAdmin
    .from("workflow_stages")
    .select("id, stage_key, name, status, order_index, workflow_id")
    .eq("workflow_id", args.workflowId)
    .order("order_index", { ascending: true });

  if (!stages || stages.length === 0) return false;

  let target = stages.find((s) => preferredKeys.includes(s.stage_key));
  if (!target) target = stages[0];
  if (!target) return false;
  if (target.status === "completed") return false;

  const { error: stageErr } = await supabaseAdmin
    .from("workflow_stages")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", target.id)
    .neq("status", "completed");

  if (stageErr) {
    console.error("[advancePaymentStageForWorkflow] stage update failed:", stageErr);
    return false;
  }

  const nextStage = stages
    .filter((s) => s.order_index > target!.order_index)
    .sort((a, b) => a.order_index - b.order_index)[0];

  const patch: Record<string, unknown> = {};
  if (nextStage) patch.current_stage_key = nextStage.stage_key;
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from("workflows").update(patch).eq("id", args.workflowId);
  }

  await recordEvent({
    workflowId: args.workflowId,
    stageId: target.id,
    eventType: "stage_completed",
    newValue: { stage_key: target.stage_key, status: "completed", reason: "payment_received" },
    actorType: "webhook",
    source: args.source,
    changeKey: args.changeKey ? `${args.changeKey}:stage` : undefined,
  });

  return true;
}

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
      await advancePaymentStageForWorkflow({
        workflowId: w.id,
        source: args.source,
        changeKey: args.changeKey,
      });
      // Marketplace bridge: expose location_services requests to the
      // PP marketplace as soon as their deposit clears. Idempotent —
      // helper no-ops on non-location_services workflows or workflows
      // already bridged.
      try {
        const { ensureContractForLocationServicesWorkflow } = await import(
          "@/lib/marketplace/contracts"
        );
        await ensureContractForLocationServicesWorkflow(w.id);
      } catch (bridgeErr) {
        console.error("[paymentSync] marketplace bridge failed:", bridgeErr);
      }
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
      await advancePaymentStageForWorkflow({
        workflowId: item.workflow_id,
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
      await advancePaymentStageForWorkflow({
        workflowId: w.id,
        source: args.source,
        changeKey: args.changeKey,
      });

      // Release any PP payouts that have been sitting in
      // awaiting_collection for this workflow's contract. Once the
      // operator's balance invoice clears, PPs get paid via Stripe
      // Connect automatically — with QB Bill fallback if the partner
      // isn't onboarded.
      try {
        const { data: contract } = await supabaseAdmin
          .from("placement_contracts")
          .select("id")
          .eq("workflow_id", w.id)
          .maybeSingle();
        if (contract) {
          const nowIso = new Date().toISOString();
          const { data: pending } = await supabaseAdmin
            .from("marketplace_payouts")
            .update({ status: "queued", updated_at: nowIso })
            .eq("contract_id", contract.id)
            .eq("status", "awaiting_collection")
            .select("id");
          if (pending?.length) {
            const { releasePayoutViaStripe } = await import("@/lib/marketplaceStripe");
            const { pushPayoutToQb } = await import("@/lib/marketplaceQb");
            for (const p of pending) {
              const result = await releasePayoutViaStripe(p.id as string);
              if (!result.ok) {
                pushPayoutToQb(p.id as string).catch(() => undefined);
              }
            }
          }
        }
      } catch (releaseErr) {
        console.error("[paymentSync] payout release on balance-paid failed:", releaseErr);
      }
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
      await advancePaymentStageForWorkflow({
        workflowId: w.id,
        source: args.source,
        changeKey: args.changeKey,
      });
    }
  }
  return updated;
}
