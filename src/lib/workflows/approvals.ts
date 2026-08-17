/**
 * Workflows — customer-approval service for location submissions.
 *
 * Called from:
 *   - Admin submission-review route (when admin approves a PP submission
 *     for a contract that has a linked location_services workflow)
 *   - Customer decisions API (accept / decline)
 *
 * Enforces the "1 decline per purchased location" rule server-side so
 * a customer with 10 purchased locations gets at most 10 declines in
 * total across the lifetime of the workflow.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { recordEvent, updateStage } from "./service";
import type { WorkflowRow } from "./types";

interface PlacementSubmissionRow {
  id: string;
  contract_id: string;
  business_name: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  employees: number | null;
  traffic_score: number | null;
  power_available: boolean | null;
  parking_available: boolean | null;
  machine_recommendation: string | null;
  notes: string | null;
}

/**
 * Called when admin approves a PP submission. If the contract has a
 * linked location_services workflow, snapshot the location and create
 * a workflow_customer_approvals row so the customer sees the decision
 * on their /account/workflows/[id] page.
 *
 * Idempotent — the UNIQUE (workflow_id, placement_submission_id) index
 * blocks duplicates; a second call returns the existing row.
 */
export async function presentSubmissionToCustomer(args: {
  submissionId: string;
}): Promise<{ approvalId: string; workflowId: string } | null> {
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id, business_name, address, city, state, zip, industry, employees, traffic_score, power_available, parking_available, machine_recommendation, notes")
    .eq("id", args.submissionId)
    .maybeSingle<PlacementSubmissionRow>();
  if (!submission) return null;

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("placement_contract_id", submission.contract_id)
    .eq("workflow_type", "location_services")
    .maybeSingle<WorkflowRow>();
  if (!workflow) return null;

  // Idempotency: return existing approval if we've already presented this submission.
  const { data: existing } = await supabaseAdmin
    .from("workflow_customer_approvals")
    .select("id")
    .eq("workflow_id", workflow.id)
    .eq("placement_submission_id", submission.id)
    .maybeSingle();
  if (existing) return { approvalId: existing.id, workflowId: workflow.id };

  const locationSnapshot = {
    business_name: submission.business_name,
    address: submission.address,
    city: submission.city,
    state: submission.state,
    zip: submission.zip,
    industry: submission.industry,
    employees: submission.employees,
    traffic_score: submission.traffic_score,
    power_available: submission.power_available,
    parking_available: submission.parking_available,
    machine_recommendation: submission.machine_recommendation,
    notes: submission.notes,
  };

  const { data: created, error } = await supabaseAdmin
    .from("workflow_customer_approvals")
    .insert({
      workflow_id: workflow.id,
      placement_submission_id: submission.id,
      location_snapshot: locationSnapshot,
      status: "pending",
      presented_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created) throw error ?? new Error("Approval insert failed");

  await recordEvent({
    workflowId: workflow.id,
    eventType: "approval_presented",
    newValue: { submission_id: submission.id, business_name: submission.business_name },
    actorType: "system",
    source: "admin_submission_approval",
  });

  // Notify customer that a decision is needed.
  try {
    const { dispatchNotification } = await import("./notifications");
    await dispatchNotification({
      workflowId: workflow.id,
      trigger: "customer.approval_needed",
      extraContext: { businessName: submission.business_name, city: submission.city, state: submission.state },
    });
  } catch (err) {
    console.error("[workflows.approvals] notification failed:", err);
  }

  return { approvalId: created.id, workflowId: workflow.id };
}

/**
 * Records a customer accept/decline on an approval row.
 *
 * - accept: marks approval accepted; mirrors to placement_submissions
 *   operator_status='accepted' so the PP marketplace UI reflects the
 *   same state; increments the workflow's secured stage; copies the
 *   location snapshot into a customer-visible note.
 * - decline: enforces the decline budget (workflows.decline_budget_used
 *   < quantity_purchased). Beyond that the request is 422.
 */
export interface RecordDecisionArgs {
  workflowId: string;
  approvalId: string;
  decision: "accepted" | "declined";
  declineReason?: string;
  actorUserId: string;
}

export async function recordCustomerDecision(args: RecordDecisionArgs): Promise<
  | { ok: true; approval: Record<string, unknown> }
  | { ok: false; error: string; code: 404 | 409 | 422 }
> {
  const { data: approval } = await supabaseAdmin
    .from("workflow_customer_approvals")
    .select("*")
    .eq("id", args.approvalId)
    .eq("workflow_id", args.workflowId)
    .maybeSingle();
  if (!approval) return { ok: false, error: "Approval not found", code: 404 };
  if (approval.status !== "pending") {
    return { ok: false, error: `Already ${approval.status}`, code: 409 };
  }

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("id", args.workflowId)
    .maybeSingle<WorkflowRow>();
  if (!workflow) return { ok: false, error: "Workflow not found", code: 404 };
  if (workflow.customer_id !== args.actorUserId) {
    return { ok: false, error: "Not your workflow", code: 409 };
  }

  // Hard decline-budget enforcement.
  if (args.decision === "declined") {
    const budget = Number(workflow.quantity_purchased);
    const used = Number(
      (workflow as unknown as { decline_budget_used: number }).decline_budget_used ?? 0,
    );
    if (used >= budget) {
      return {
        ok: false,
        error: "Decline budget exhausted — you must accept or ignore this submission",
        code: 422,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const { data: updatedApproval, error: updateErr } = await supabaseAdmin
    .from("workflow_customer_approvals")
    .update({
      status: args.decision,
      decided_at: nowIso,
      decided_by: args.actorUserId,
      decline_reason: args.decision === "declined" ? args.declineReason ?? null : null,
    })
    .eq("id", args.approvalId)
    .eq("status", "pending") // guard against race
    .select("*")
    .single();
  if (updateErr || !updatedApproval) {
    return { ok: false, error: "Update failed", code: 409 };
  }

  // Mirror to placement_submissions.operator_status so the PP + operator
  // marketplace views stay in sync.
  if (approval.placement_submission_id) {
    await supabaseAdmin
      .from("placement_submissions")
      .update({
        operator_status: args.decision,
        operator_reviewer_id: args.actorUserId,
        operator_reviewed_at: nowIso,
        operator_review_note: args.declineReason ?? null,
        updated_at: nowIso,
      })
      .eq("id", approval.placement_submission_id);
  }

  const snapshot = approval.location_snapshot as {
    business_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  const locationLabel = [snapshot.business_name, snapshot.city, snapshot.state]
    .filter(Boolean)
    .join(" — ");

  await recordEvent({
    workflowId: workflow.id,
    eventType: args.decision === "accepted" ? "customer_accepted_location" : "customer_declined_location",
    previousValue: { status: "pending" },
    newValue: {
      status: args.decision,
      submission_id: approval.placement_submission_id,
      location: locationLabel,
    },
    actorUserId: args.actorUserId,
    actorType: "customer",
    source: "customer_decision",
    notes: args.declineReason,
  });

  if (args.decision === "accepted") {
    // Copy the location into a customer-visible note so the customer
    // has a record on their workflow detail page.
    await supabaseAdmin.from("workflow_notes").insert({
      workflow_id: workflow.id,
      author_user_id: null,
      visibility: "customer",
      body:
        `Location secured: ${snapshot.business_name ?? ""}\n` +
        `${snapshot.address ?? ""}\n` +
        `${[snapshot.city, snapshot.state, snapshot.zip].filter(Boolean).join(", ")}`,
    });

    // Advance the linked contract's locations_filled counter (same
    // logic as operator accept in the PP marketplace).
    if (workflow.placement_contract_id) {
      const { data: contract } = await supabaseAdmin
        .from("placement_contracts")
        .select("id, locations_needed, locations_filled, status")
        .eq("id", workflow.placement_contract_id)
        .maybeSingle();
      if (contract) {
        const nextFilled = (contract.locations_filled ?? 0) + 1;
        const nextStatus = nextFilled >= contract.locations_needed ? "fulfilled" : contract.status;
        await supabaseAdmin
          .from("placement_contracts")
          .update({ locations_filled: nextFilled, status: nextStatus, updated_at: nowIso })
          .eq("id", contract.id);
      }
    }

    // Advance the secured stage on the workflow.
    try {
      const { data: securedStage } = await supabaseAdmin
        .from("workflow_stages")
        .select("completed_quantity")
        .eq("workflow_id", workflow.id)
        .eq("stage_key", "secured")
        .maybeSingle();
      const currentSecured = Number(securedStage?.completed_quantity ?? 0);
      await updateStage({
        workflowId: workflow.id,
        stageKey: "secured",
        completedQuantity: currentSecured + 1,
        updatedBy: args.actorUserId,
        actorType: "customer",
        source: "customer_accept_submission",
        changeKey: `customer_accept:${args.approvalId}`,
      });
    } catch (err) {
      console.error("[approvals] secured stage advance failed:", err);
    }

    // Parity with the /operator/marketplace/submissions/[id]/decide path:
    // queue the partner payout + operator invoice so the PP has a
    // marketplace_payouts row that the balance-paid webhook can later
    // release via Stripe Connect. Idempotent — each helper unique-keys
    // on submission_id. Non-blocking.
    if (approval.placement_submission_id) {
      try {
        const {
          queuePartnerPayoutForSubmission,
          queueOperatorInvoiceForSubmission,
        } = await import("@/lib/marketplaceHandoff");
        await queuePartnerPayoutForSubmission({
          submissionId: approval.placement_submission_id,
          triggeredBy: args.actorUserId,
        });
        await queueOperatorInvoiceForSubmission({
          submissionId: approval.placement_submission_id,
          triggeredBy: args.actorUserId,
        });
      } catch (queueErr) {
        console.error("[approvals] payout/invoice queue failed:", queueErr);
      }
    }
  } else {
    // Decline: bump decline_budget_used with optimistic-concurrency
    // re-read (no RPC required; the workflow.version check makes this
    // safe under concurrent writes).
    const { data: fresh } = await supabaseAdmin
      .from("workflows")
      .select("decline_budget_used, version")
      .eq("id", workflow.id)
      .maybeSingle();
    const currentUsed = Number((fresh as { decline_budget_used?: number } | null)?.decline_budget_used ?? 0);
    const currentVersion = Number((fresh as { version?: number } | null)?.version ?? workflow.version);
    await supabaseAdmin
      .from("workflows")
      .update({ decline_budget_used: currentUsed + 1, version: currentVersion + 1 })
      .eq("id", workflow.id)
      .eq("version", currentVersion);

    // Notify PP that a re-submission is needed.
    try {
      const { notifyPartnerOperatorDecided } = await import("../marketplaceNotifications");
      if (approval.placement_submission_id) {
        await notifyPartnerOperatorDecided(approval.placement_submission_id, "rejected");
      }
    } catch (err) {
      console.error("[approvals] PP decline notification failed:", err);
    }
  }

  return { ok: true, approval: updatedApproval };
}

/**
 * Returns the remaining decline budget for a workflow (quantity_purchased -
 * decline_budget_used). Never returns negative.
 */
export async function remainingDeclineBudget(workflowId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("workflows")
    .select("quantity_purchased, decline_budget_used")
    .eq("id", workflowId)
    .maybeSingle();
  if (!data) return 0;
  const purchased = Number((data as { quantity_purchased: number }).quantity_purchased ?? 0);
  const used = Number((data as { decline_budget_used?: number }).decline_budget_used ?? 0);
  return Math.max(0, purchased - used);
}
