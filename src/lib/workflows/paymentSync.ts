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
 * Location-services intake used to spawn a workflow at /request-location
 * time with payment_status='partial'. That leaked speculative requests
 * (never-paid deposits) into the workflows queue. We now defer the
 * spawn until the QB invoice actually clears — this helper handles it.
 *
 * Idempotent: no-ops if a workflow is already linked to the order or
 * to the underlying lead (source_id).
 *
 * Returns just the workflow id (or null on any hard fail) so all the
 * existing callers keep working. Behind the scenes it uses
 * spawnLocationServicesWorkflowFromPaidOrderDetailed — which returns
 * a discriminated result with a machine-readable reason — so admin
 * fallback surfaces can tell the operator EXACTLY why nothing spawned
 * instead of a vague "returned null".
 */
export async function spawnLocationServicesWorkflowFromPaidOrder(
  orderId: string,
): Promise<string | null> {
  const result = await spawnLocationServicesWorkflowFromPaidOrderDetailed(orderId);
  return result.workflow_id;
}

/**
 * Structured version of the spawn — returns why nothing happened so
 * the /api/sales/orders/[id]/send-to-workflow admin fallback can
 * report actionable reasons to the operator instead of a generic
 * "returned null" error.
 */
export interface SpawnResult {
  workflow_id: string | null;
  outcome:
    | "spawned"
    | "already_linked"
    | "already_linked_by_lead"
    | "order_missing"
    | "order_wrong_type"
    | "missing_email"
    | "profile_provisioning_failed"
    | "workflow_insert_failed";
  reason: string;
}

export async function spawnLocationServicesWorkflowFromPaidOrderDetailed(
  orderId: string,
): Promise<SpawnResult> {
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("id, lead_id, account_id, recipient_email, order_type, notes")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    return { workflow_id: null, outcome: "order_missing", reason: `No sales_orders row with id ${orderId}.` };
  }
  if (order.order_type !== "location_services") {
    return {
      workflow_id: null,
      outcome: "order_wrong_type",
      reason: `Order type is '${order.order_type ?? "(null)"}', not 'location_services'.`,
    };
  }

  const { data: lead } = order.lead_id
    ? await supabaseAdmin
        .from("sales_leads")
        .select("id, business_name, contact_name, phone, email, address, state, zip_code, machine_count, machine_type, travel_radius_miles, excluded_industries, meeting_availability, assigned_to")
        .eq("id", order.lead_id)
        .maybeSingle()
    : { data: null };

  const recipientEmail = (order.recipient_email || lead?.email || "").trim();
  if (!recipientEmail) {
    return {
      workflow_id: null,
      outcome: "missing_email",
      reason: "Neither the sales_order.recipient_email nor the linked sales_lead.email is set — nothing to attach a customer to.",
    };
  }

  let { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .ilike("email", recipientEmail)
    .maybeSingle();

  // Guest intake: /request-location is public, so the customer may
  // have paid without ever creating an account. Provision a real
  // profile flagged is_provisional=true so the workflow can attach
  // to a legitimate customer_id. Uses the same helper the coffee
  // guest checkout relies on so the "claim your account" magic-link
  // flow works uniformly.
  if (!profile) {
    try {
      const { provisionAccountForGuestCheckout } = await import(
        "@/lib/auth/provisionalAccount"
      );
      const provisioned = await provisionAccountForGuestCheckout({
        email: recipientEmail,
        business_name: lead?.business_name ?? "",
        contact_name: lead?.contact_name ?? "",
        phone: lead?.phone ?? "",
        address: lead?.address ?? "",
        city: null,
        state: lead?.state ?? null,
        zip: null,
        marketing_consent: false,
        referring_sales_rep_id: lead?.assigned_to ?? null,
      });
      profile = { id: provisioned.userId };
    } catch (provisionErr) {
      const msg = provisionErr instanceof Error ? provisionErr.message : String(provisionErr);
      console.error(
        "[paymentSync] provisional profile creation failed for location_services payment:",
        provisionErr,
      );
      return {
        workflow_id: null,
        outcome: "profile_provisioning_failed",
        reason: `Could not provision a provisional profile for ${recipientEmail}: ${msg.slice(0, 260)}.`,
      };
    }
  }
  if (!profile) {
    return {
      workflow_id: null,
      outcome: "profile_provisioning_failed",
      reason: `Provisioning completed without an error but no profile id came back for ${recipientEmail}.`,
    };
  }

  const machineCount = Number(lead?.machine_count ?? 0) || 1;
  const depositPerLocationCents = 10000; // $100 — matches request-location constant
  const depositCents = machineCount * depositPerLocationCents;
  // $500 placement fee per location on top of the $100 deposit.
  const totalDueCents = depositCents + machineCount * 50000;

  // Idempotency: if a workflow already exists for this lead's
  // source_id, bail. The getOrCreateWorkflow call also enforces
  // this, but skipping the extra work here is cheaper.
  if (order.lead_id) {
    const { data: existing } = await supabaseAdmin
      .from("workflows")
      .select("id")
      .eq("source_type", "location_request")
      .eq("source_id", order.lead_id)
      .eq("workflow_type", "location_services")
      .maybeSingle();
    if (existing) {
      return {
        workflow_id: existing.id as string,
        outcome: "already_linked_by_lead",
        reason: `A workflow already exists for lead ${order.lead_id}.`,
      };
    }
  }

  // Refer-rep name (for the intake snapshot). Best-effort — not fatal
  // if the assigned_to profile lookup fails.
  let referringRepName: string | null = null;
  if (lead?.assigned_to) {
    const { data: rep } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", lead.assigned_to)
      .maybeSingle();
    referringRepName = rep?.full_name ?? null;
  }

  let workflow;
  try {
    const { getOrCreateWorkflow } = await import("./service");
    const result = await getOrCreateWorkflow({
      customerId: profile.id,
      workflowType: "location_services",
      sourceType: "location_request",
      sourceId: order.lead_id ?? orderId,
      locationRequestId: order.lead_id ?? undefined,
      orderId,
      productKey: "location_services",
      productName: `Location Services — ${machineCount} location${machineCount > 1 ? "s" : ""}`,
      quantityPurchased: machineCount,
      paymentStatus: "paid",
      primaryTeam: "locations",
      startDate: new Date().toISOString(),
      metadata: {
        source: "request-location-deposit-paid",
        deposit_amount_cents: depositCents,
        deposit_paid_cents: depositCents,
        deposit_per_location_cents: depositPerLocationCents,
        total_due_cents: totalDueCents,
        source_intake: {
          business_name: lead?.business_name ?? null,
          contact_name: lead?.contact_name ?? null,
          phone: lead?.phone ?? null,
          email: recipientEmail,
          address: lead?.address ?? null,
          state: lead?.state ?? null,
          zip_code: lead?.zip_code ?? null,
          machine_count: machineCount,
          machine_type: lead?.machine_type ?? null,
          travel_radius_miles: (lead as { travel_radius_miles?: number | null } | null)?.travel_radius_miles ?? null,
          excluded_industries: (lead as { excluded_industries?: string | null } | null)?.excluded_industries ?? null,
          meeting_availability: (lead as { meeting_availability?: string | null } | null)?.meeting_availability ?? null,
          referring_sales_rep_name: referringRepName,
        },
      },
      actorType: "system",
    });
    workflow = result.workflow;
  } catch (insertErr) {
    const msg = insertErr instanceof Error ? insertErr.message : String(insertErr);
    console.error("[paymentSync] getOrCreateWorkflow threw during spawn:", insertErr);
    return {
      workflow_id: null,
      outcome: "workflow_insert_failed",
      reason: `getOrCreateWorkflow failed: ${msg.slice(0, 260)}.`,
    };
  }

  // Stamp the deposit money columns (mirrors what the intake path
  // used to do — the UI reads these directly rather than the
  // metadata sidecar).
  await supabaseAdmin
    .from("workflows")
    .update({
      deposit_paid_cents: depositCents,
      total_due_cents: totalDueCents,
    })
    .eq("id", workflow.id);

  return {
    workflow_id: workflow.id,
    outcome: "spawned",
    reason: `Spawned workflow ${workflow.id} for order ${orderId}.`,
  };
}

/**
 * Mark any workflow(s) linked to this sales_order as paid. For
 * location_services orders that have no linked workflow yet (intake
 * no longer spawns one — we wait for the deposit to clear), also
 * spawn the workflow in the paid state before running the mark-paid
 * loop.
 */
export async function syncWorkflowFromSalesOrderPaid(args: {
  orderId: string;
  amountCents?: number;
  source: string;
  changeKey?: string;
}): Promise<number> {
  // Payment-time spawn. Only fires when no workflow is linked yet; both
  // helpers are idempotent.
  //
  // location_services keeps its dedicated spawner because it links the
  // workflow back to the originating lead. Every OTHER order type used
  // to get nothing at all here — a paid machine, coffee or financing
  // order sat in the CRM with no workflow and no one assigned, and the
  // only remedy was an admin-only button. spawnWorkflowsForPaidOrder
  // reads the order's line items and creates the workflows they call
  // for.
  try {
    const { data: existingLinked } = await supabaseAdmin
      .from("workflows")
      .select("id")
      .eq("order_id", args.orderId)
      .limit(1)
      .maybeSingle();
    if (!existingLinked) {
      const spawned = await spawnLocationServicesWorkflowFromPaidOrder(args.orderId);
      if (!spawned) {
        const { spawnWorkflowsForPaidOrder } = await import("./fromPaidOrder");
        await spawnWorkflowsForPaidOrder(args.orderId);
      }
    }
  } catch (spawnErr) {
    console.error(
      "[paymentSync] workflow spawn on paid order failed:",
      spawnErr,
    );
  }

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

      // Release any PP payouts that were parked in awaiting_collection
      // for this workflow's contract. Once the operator's balance
      // invoice clears, drop them to 'queued' and try Dwolla ACH
      // first — if the partner isn't Dwolla-onboarded (or Dwolla
      // rejects), fall back to the QB Bill drain.
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
            const { releasePayoutViaDwolla } = await import("@/lib/marketplaceDwolla");
            const { pushPayoutToQb } = await import("@/lib/marketplaceQb");
            for (const p of pending) {
              const result = await releasePayoutViaDwolla(p.id as string);
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
