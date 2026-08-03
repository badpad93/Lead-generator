/**
 * Workflows — centralized service layer.
 *
 * Every write to any workflow table goes through this module. Callers
 * (agreement hooks, checkout completions, admin API routes, cron jobs)
 * pass a normalized input and let the service handle:
 *
 *   - idempotency (same source event never creates duplicates)
 *   - template resolution + stage seeding
 *   - quantity validation (non-negative; monotonic; over-target requires
 *     explicit override)
 *   - overall_status recomputation
 *   - immutable audit-event writes
 *   - optimistic-concurrency version bumps
 *
 * The service NEVER sends emails or triggers notifications directly —
 * `notifications.ts` (built on top of `workflow_events`) is responsible
 * for delivery. This keeps write paths fast and idempotent.
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { getTemplateDef, WORKFLOW_TEMPLATES } from "./templates";
import type {
  AddNoteInput,
  AddShipmentInput,
  AttachOrderInput,
  AssignmentInput,
  CreateWorkflowInput,
  OverallStatus,
  UpdateOrderItemInput,
  UpdateStageInput,
  WorkflowRow,
  WorkflowStageRow,
  WorkflowTemplateRow,
} from "./types";

// ─── Template sync (idempotent upsert of code-defined templates) ─────────

export async function syncWorkflowTemplates(): Promise<void> {
  for (const def of WORKFLOW_TEMPLATES) {
    const { data: existing } = await supabaseAdmin
      .from("workflow_templates")
      .select("id")
      .eq("workflow_type", def.workflowType)
      .eq("version", def.version)
      .maybeSingle();

    let templateId: string;

    if (existing) {
      templateId = existing.id;
      await supabaseAdmin
        .from("workflow_templates")
        .update({
          title: def.title,
          description: def.description,
          default_deadline_days: def.defaultDeadlineDays,
          quantity_based: def.quantityBased,
          completion_rule: def.completionRule,
          active: true,
        })
        .eq("id", templateId);
    } else {
      const { data: inserted, error } = await supabaseAdmin
        .from("workflow_templates")
        .insert({
          workflow_type: def.workflowType,
          version: def.version,
          title: def.title,
          description: def.description,
          default_deadline_days: def.defaultDeadlineDays,
          quantity_based: def.quantityBased,
          completion_rule: def.completionRule,
          active: true,
        })
        .select("id")
        .single();
      if (error || !inserted) throw error ?? new Error("Template insert failed");
      templateId = inserted.id;
    }

    // Upsert stages — safe because (template_id, stage_key) is unique.
    for (const stage of def.stages) {
      await supabaseAdmin
        .from("workflow_template_stages")
        .upsert(
          {
            template_id: templateId,
            stage_key: stage.key,
            stage_name: stage.name,
            stage_order: stage.order,
            stage_type: stage.type,
            required_for_completion: stage.requiredForCompletion,
            customer_visible: stage.customerVisible,
            default_customer_message: stage.defaultCustomerMessage ?? null,
            description: stage.description ?? null,
          },
          { onConflict: "template_id,stage_key" },
        );
    }
  }
}

// ─── Idempotent workflow creation ────────────────────────────────────────

export interface WorkflowCreationResult {
  workflow: WorkflowRow;
  stages: WorkflowStageRow[];
  created: boolean; // false when an existing workflow was returned
}

export async function getOrCreateWorkflow(
  input: CreateWorkflowInput,
): Promise<WorkflowCreationResult> {
  const productKey = input.productKey ?? "";

  // Idempotency lookup uses the same key as the DB unique index.
  const { data: existing } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .eq("workflow_type", input.workflowType)
    .filter("product_key", productKey === "" ? "is" : "eq", productKey === "" ? null : productKey)
    .maybeSingle();

  if (existing) {
    const stages = await loadStages(existing.id);
    return { workflow: existing as WorkflowRow, stages, created: false };
  }

  const template = await resolveTemplate(input);
  const dueDate =
    input.dueDate ??
    (template?.default_deadline_days
      ? new Date(Date.now() + template.default_deadline_days * 86400_000).toISOString()
      : null);

  const title =
    input.title ??
    (template ? `${template.title}` : `${input.workflowType} — ${input.productName ?? "Workflow"}`);

  const insertPayload: Record<string, unknown> = {
    customer_id: input.customerId,
    company_id: input.companyId ?? null,
    workflow_type: input.workflowType,
    template_id: template?.id ?? null,
    template_version: template?.version ?? null,
    title,
    description: input.description ?? null,
    source_type: input.sourceType,
    source_id: input.sourceId,
    agreement_id: input.agreementId ?? null,
    order_id: input.orderId ?? null,
    coffee_order_id: input.coffeeOrderId ?? null,
    purchase_id: input.purchaseId ?? null,
    location_request_id: input.locationRequestId ?? null,
    placement_contract_id: input.placementContractId ?? null,
    financing_application_id: input.financingApplicationId ?? null,
    website_request_id: input.websiteRequestId ?? null,
    product_key: input.productKey ?? null,
    product_name: input.productName ?? null,
    service_id: input.serviceId ?? null,
    quantity_purchased: input.quantityPurchased ?? 1,
    quantity_completed: 0,
    payment_status: input.paymentStatus ?? "unpaid",
    overall_status: "not_started",
    priority: input.priority ?? "normal",
    start_date: input.startDate ?? new Date().toISOString(),
    due_date: dueDate,
    assigned_user_id: input.assignedUserId ?? null,
    primary_team: input.primaryTeam ?? null,
    imported_from_legacy: input.importedFromLegacy ?? false,
    suppress_initial_customer_email: input.suppressInitialCustomerEmail ?? false,
    created_by: input.createdBy ?? null,
    metadata: input.metadata ?? {},
  };

  const { data: created, error } = await supabaseAdmin
    .from("workflows")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error || !created) {
    // Race: another caller might have inserted the same idempotency key
    // between our lookup and this insert. Re-read and return.
    const { data: raceExisting } = await supabaseAdmin
      .from("workflows")
      .select("*")
      .eq("source_type", input.sourceType)
      .eq("source_id", input.sourceId)
      .eq("workflow_type", input.workflowType)
      .filter("product_key", productKey === "" ? "is" : "eq", productKey === "" ? null : productKey)
      .maybeSingle();
    if (raceExisting) {
      const stages = await loadStages(raceExisting.id);
      return { workflow: raceExisting as WorkflowRow, stages, created: false };
    }
    throw error ?? new Error("Workflow insert failed");
  }

  const workflow = created as WorkflowRow;

  // Seed stages from the template.
  const stages = await seedStagesFromTemplate(workflow.id, template, workflow.quantity_purchased);

  await recordEvent({
    workflowId: workflow.id,
    eventType: "created",
    newValue: {
      workflow_type: workflow.workflow_type,
      source_type: workflow.source_type,
      source_id: workflow.source_id,
      product_key: workflow.product_key,
      quantity_purchased: workflow.quantity_purchased,
    },
    actorUserId: input.createdBy ?? null,
    actorType: input.actorType ?? "system",
    source: input.sourceType,
  });

  // Fire the "workflow.created" notification unless the caller
  // explicitly suppressed it (used by the legacy backfill import).
  if (!workflow.suppress_initial_customer_email) {
    try {
      const { dispatchNotification } = await import("./notifications");
      await dispatchNotification({
        workflowId: workflow.id,
        trigger: "workflow.created",
      });
    } catch (err) {
      console.error("[workflows.service] notification dispatch failed:", err);
    }
  }

  return { workflow, stages, created: true };
}

async function resolveTemplate(input: CreateWorkflowInput): Promise<WorkflowTemplateRow | null> {
  // Prefer the latest active DB template for this type (allows admins to
  // publish new versions without a code redeploy).
  const { data: dbTemplate } = await supabaseAdmin
    .from("workflow_templates")
    .select("*")
    .eq("workflow_type", input.workflowType)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dbTemplate) return dbTemplate as WorkflowTemplateRow;

  // Fallback: code-defined default (used before syncWorkflowTemplates has run).
  const def = getTemplateDef(input.workflowType);
  if (!def) return null;

  // Insert the default so future calls hit the DB path.
  const { data: inserted } = await supabaseAdmin
    .from("workflow_templates")
    .insert({
      workflow_type: def.workflowType,
      version: def.version,
      title: def.title,
      description: def.description,
      default_deadline_days: def.defaultDeadlineDays,
      quantity_based: def.quantityBased,
      completion_rule: def.completionRule,
      active: true,
    })
    .select("*")
    .single();

  if (!inserted) return null;

  for (const stage of def.stages) {
    await supabaseAdmin
      .from("workflow_template_stages")
      .upsert(
        {
          template_id: inserted.id,
          stage_key: stage.key,
          stage_name: stage.name,
          stage_order: stage.order,
          stage_type: stage.type,
          required_for_completion: stage.requiredForCompletion,
          customer_visible: stage.customerVisible,
          default_customer_message: stage.defaultCustomerMessage ?? null,
          description: stage.description ?? null,
        },
        { onConflict: "template_id,stage_key" },
      );
  }

  return inserted as WorkflowTemplateRow;
}

async function seedStagesFromTemplate(
  workflowId: string,
  template: WorkflowTemplateRow | null,
  quantityPurchased: number,
): Promise<WorkflowStageRow[]> {
  if (!template) return [];

  const { data: templateStages } = await supabaseAdmin
    .from("workflow_template_stages")
    .select("*")
    .eq("template_id", template.id)
    .order("stage_order", { ascending: true });

  if (!templateStages || templateStages.length === 0) return [];

  const rows = templateStages.map((ts) => ({
    workflow_id: workflowId,
    template_stage_id: ts.id,
    stage_key: ts.stage_key,
    stage_name: ts.stage_name,
    stage_order: ts.stage_order,
    stage_type: ts.stage_type,
    status: "not_started",
    target_quantity: ts.stage_type === "quantity" ? quantityPurchased : null,
    completed_quantity: 0,
    customer_visible: ts.customer_visible,
    required_for_completion: ts.required_for_completion,
    customer_message: ts.default_customer_message,
  }));

  const { data: inserted, error } = await supabaseAdmin
    .from("workflow_stages")
    .insert(rows)
    .select("*");

  if (error) throw error;
  return (inserted ?? []) as WorkflowStageRow[];
}

async function loadStages(workflowId: string): Promise<WorkflowStageRow[]> {
  const { data } = await supabaseAdmin
    .from("workflow_stages")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("stage_order", { ascending: true });
  return (data ?? []) as WorkflowStageRow[];
}

// ─── Stage updates (quantity + status + monotonic guards) ────────────────

export interface UpdateStageResult {
  stage: WorkflowStageRow;
  workflow: WorkflowRow;
  changed: boolean; // false if update was a no-op (dedup)
}

export async function updateStage(input: UpdateStageInput): Promise<UpdateStageResult> {
  // Idempotency: if the same change_key has already been recorded, no-op.
  if (input.changeKey) {
    const { data: dupe } = await supabaseAdmin
      .from("workflow_events")
      .select("id")
      .eq("workflow_id", input.workflowId)
      .eq("change_key", input.changeKey)
      .maybeSingle();
    if (dupe) {
      const stage = await getStage(input.workflowId, input.stageKey);
      const workflow = await getWorkflow(input.workflowId);
      if (!stage || !workflow) throw new Error("Stage or workflow not found");
      return { stage, workflow, changed: false };
    }
  }

  const stage = await getStage(input.workflowId, input.stageKey);
  const workflow = await getWorkflow(input.workflowId);
  if (!stage || !workflow) throw new Error("Stage or workflow not found");

  const previous = {
    status: stage.status,
    completed_quantity: stage.completed_quantity,
    internal_notes: stage.internal_notes,
    customer_message: stage.customer_message,
    stage_name: stage.stage_name,
  };

  const patch: Record<string, unknown> = { updated_by: input.updatedBy ?? null };
  const changedFields: string[] = [];

  if (input.completedQuantity !== undefined) {
    if (input.completedQuantity < 0) {
      throw new Error("completed_quantity cannot be negative");
    }
    if (stage.target_quantity != null && input.completedQuantity > stage.target_quantity && !input.allowOverTarget) {
      throw new Error(
        `completed_quantity ${input.completedQuantity} exceeds target ${stage.target_quantity} — override required`,
      );
    }
    // Monotonic check: later quantity stages must not exceed prior quantity stages.
    if (stage.stage_type === "quantity") {
      const priorMax = await getPriorQuantityStageMax(input.workflowId, stage.stage_order);
      if (priorMax != null && input.completedQuantity > priorMax && !input.allowOverTarget) {
        throw new Error(
          `completed_quantity ${input.completedQuantity} exceeds prior stage max ${priorMax} — override required`,
        );
      }
    }
    patch.completed_quantity = input.completedQuantity;
    changedFields.push("completed_quantity");

    // Auto-transition status when quantity hits target.
    if (
      stage.target_quantity != null &&
      input.completedQuantity >= stage.target_quantity &&
      input.status === undefined
    ) {
      patch.status = "completed";
      patch.completed_at = new Date().toISOString();
      changedFields.push("status");
    } else if (input.completedQuantity > 0 && stage.status === "not_started" && input.status === undefined) {
      patch.status = "in_progress";
      patch.started_at = stage.started_at ?? new Date().toISOString();
      changedFields.push("status");
    }
  }

  if (input.status !== undefined && input.status !== stage.status) {
    patch.status = input.status;
    if (input.status === "completed" && stage.completed_at == null) {
      patch.completed_at = new Date().toISOString();
    }
    if (input.status === "in_progress" && stage.started_at == null) {
      patch.started_at = new Date().toISOString();
    }
    changedFields.push("status");
  }

  if (input.internalNotes !== undefined && input.internalNotes !== stage.internal_notes) {
    patch.internal_notes = input.internalNotes;
    changedFields.push("internal_notes");
  }

  if (input.customerMessage !== undefined && input.customerMessage !== stage.customer_message) {
    patch.customer_message = input.customerMessage;
    changedFields.push("customer_message");
  }

  if (input.stageName !== undefined) {
    const trimmed = input.stageName.trim();
    if (trimmed.length === 0) {
      throw new Error("stage_name cannot be empty");
    }
    if (trimmed !== stage.stage_name) {
      patch.stage_name = trimmed;
      changedFields.push("stage_name");
    }
  }

  if (changedFields.length === 0) {
    return { stage, workflow, changed: false };
  }

  // Optimistic concurrency: bump version, condition on prior version.
  patch.version = stage.version + 1;

  const { data: updated, error } = await supabaseAdmin
    .from("workflow_stages")
    .update(patch)
    .eq("id", stage.id)
    .eq("version", stage.version)
    .select("*")
    .single();

  if (error || !updated) {
    throw new Error("Stage update failed — another user may have edited it. Please refresh.");
  }

  // Auto-sync workflow.payment_status when the payment_confirmed stage
  // is marked completed. Fixes the "workflow list still says 'pending
  // payment' after clicking the stage complete" bug — the two fields
  // were tracking the same concept without staying in sync.
  const updatedStage = updated as WorkflowStageRow;
  if (
    stage.stage_key === "payment_confirmed" &&
    updatedStage.status === "completed" &&
    workflow.payment_status !== "paid"
  ) {
    await supabaseAdmin
      .from("workflows")
      .update({
        payment_status: "paid",
        version: workflow.version + 1,
        updated_by: input.updatedBy ?? null,
      })
      .eq("id", workflow.id)
      .eq("version", workflow.version);
    await recordEvent({
      workflowId: workflow.id,
      eventType: "payment_status_auto_synced",
      previousValue: { payment_status: workflow.payment_status },
      newValue: { payment_status: "paid" },
      changedFields: ["payment_status"],
      actorUserId: input.updatedBy ?? null,
      actorType: input.actorType ?? "staff",
      source: "payment_confirmed_stage",
    });
    // Bump the local copy so the rollup below sees the new value.
    workflow.payment_status = "paid";
    workflow.version = workflow.version + 1;
  }

  await recordEvent({
    workflowId: input.workflowId,
    stageId: stage.id,
    eventType: input.completedQuantity !== undefined ? "quantity_updated" : "stage_updated",
    previousValue: previous,
    newValue: {
      status: (updated as WorkflowStageRow).status,
      completed_quantity: (updated as WorkflowStageRow).completed_quantity,
      internal_notes: (updated as WorkflowStageRow).internal_notes,
      customer_message: (updated as WorkflowStageRow).customer_message,
      stage_name: (updated as WorkflowStageRow).stage_name,
    },
    changedFields,
    actorUserId: input.updatedBy ?? null,
    actorType: input.actorType ?? "staff",
    source: input.source,
    changeKey: input.changeKey,
  });

  // Recompute derived overall_status + quantity_completed.
  const refreshedWorkflow = await recomputeWorkflowRollup(input.workflowId, input.updatedBy ?? null);

  // Fire stage-specific notifications. Mapping stage_key → trigger:
  //   shipped → machine.shipped / coffee.equipment_shipped
  //   delivered → machine.delivered / coffee.equipment_delivered
  //   secured → location.secured
  //   completed → location.completed (for location_services)
  //   approved / funded → financing.approved / financing.funded
  //   installation_scheduled → coffee.installation_scheduled
  try {
    const trigger = triggerForStageEvent(refreshedWorkflow.workflow_type, stage.stage_key, updated as WorkflowStageRow);
    if (trigger) {
      const { dispatchNotification } = await import("./notifications");
      await dispatchNotification({
        workflowId: refreshedWorkflow.id,
        trigger,
        stageKey: stage.stage_key,
      });
    }
    // If the rollup transitioned to `completed`, fire the completion email.
    if (refreshedWorkflow.overall_status === "completed" && workflow.overall_status !== "completed") {
      const { dispatchNotification } = await import("./notifications");
      await dispatchNotification({
        workflowId: refreshedWorkflow.id,
        trigger: "workflow.completed",
      });
    }
  } catch (err) {
    console.error("[workflows.service] stage notification dispatch failed:", err);
  }

  return { stage: updated as WorkflowStageRow, workflow: refreshedWorkflow, changed: true };
}

function triggerForStageEvent(
  workflowType: string,
  stageKey: string,
  updated: WorkflowStageRow,
): import("./notifications").NotificationTrigger | null {
  // Only fire on quantity increases or status → completed transitions
  // (avoids re-emitting for cosmetic edits).
  const advanced = updated.status === "completed" || Number(updated.completed_quantity) > 0;
  if (!advanced) return null;

  if (workflowType === "ai_machine_fulfillment") {
    if (stageKey === "shipped") return "machine.shipped";
    if (stageKey === "delivered") return "machine.delivered";
  }
  if (workflowType === "coffee_equipment") {
    if (stageKey === "shipped") return "coffee.equipment_shipped";
    if (stageKey === "delivered") return "coffee.equipment_delivered";
    if (stageKey === "installation_scheduled") return "coffee.installation_scheduled";
  }
  if (workflowType === "location_services") {
    if (stageKey === "secured") return "location.secured";
    if (stageKey === "completed") return "location.completed";
  }
  if (workflowType === "financing") {
    if (stageKey === "pre_approved") return "financing.pre_approved";
    if (stageKey === "approved") return "financing.approved";
    if (stageKey === "funded") return "financing.funded";
    if (stageKey === "declined") return "financing.declined";
  }
  return null;
}

async function getPriorQuantityStageMax(
  workflowId: string,
  currentOrder: number,
): Promise<number | null> {
  const { data } = await supabaseAdmin
    .from("workflow_stages")
    .select("completed_quantity, stage_type, stage_order")
    .eq("workflow_id", workflowId)
    .eq("stage_type", "quantity")
    .lt("stage_order", currentOrder)
    .order("stage_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.completed_quantity) : null;
}

async function getStage(workflowId: string, stageKey: string): Promise<WorkflowStageRow | null> {
  const { data } = await supabaseAdmin
    .from("workflow_stages")
    .select("*")
    .eq("workflow_id", workflowId)
    .eq("stage_key", stageKey)
    .maybeSingle();
  return data as WorkflowStageRow | null;
}

async function getWorkflow(workflowId: string): Promise<WorkflowRow | null> {
  const { data } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  return data as WorkflowRow | null;
}

// ─── Rollup: recompute quantity_completed + overall_status ───────────────

export async function recomputeWorkflowRollup(
  workflowId: string,
  actorUserId: string | null,
): Promise<WorkflowRow> {
  const workflow = await getWorkflow(workflowId);
  if (!workflow) throw new Error("Workflow not found");

  const stages = await loadStages(workflowId);
  const template = workflow.template_id
    ? await getTemplateRow(workflow.template_id)
    : null;

  // Roll up completed quantity from the LAST quantity stage that's part
  // of completion (or from `activated` if present).
  const requiredQuantityStages = stages.filter(
    (s) => s.stage_type === "quantity" && s.required_for_completion,
  );
  const rollupSource =
    requiredQuantityStages.length > 0
      ? requiredQuantityStages[requiredQuantityStages.length - 1]
      : stages.filter((s) => s.stage_type === "quantity").at(-1) ?? null;

  const newQuantityCompleted = rollupSource ? Number(rollupSource.completed_quantity) : workflow.quantity_completed;

  const newOverallStatus = deriveOverallStatus(workflow, stages, template);

  const patch: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if (newQuantityCompleted !== workflow.quantity_completed) {
    patch.quantity_completed = newQuantityCompleted;
    changedFields.push("quantity_completed");
  }
  if (newOverallStatus !== workflow.overall_status) {
    patch.overall_status = newOverallStatus;
    changedFields.push("overall_status");
    if (newOverallStatus === "completed" && workflow.completed_at == null) {
      patch.completed_at = new Date().toISOString();
    }
  }

  if (changedFields.length === 0) return workflow;

  patch.updated_by = actorUserId;
  patch.version = workflow.version + 1;

  const { data: updated } = await supabaseAdmin
    .from("workflows")
    .update(patch)
    .eq("id", workflow.id)
    .eq("version", workflow.version)
    .select("*")
    .single();

  if (updated) {
    await recordEvent({
      workflowId: workflow.id,
      eventType: "rollup_recomputed",
      previousValue: { overall_status: workflow.overall_status, quantity_completed: workflow.quantity_completed },
      newValue: { overall_status: newOverallStatus, quantity_completed: newQuantityCompleted },
      changedFields,
      actorUserId,
      actorType: "system",
    });
  }

  return (updated ?? workflow) as WorkflowRow;
}

async function getTemplateRow(templateId: string): Promise<WorkflowTemplateRow | null> {
  const { data } = await supabaseAdmin
    .from("workflow_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  return data as WorkflowTemplateRow | null;
}

function deriveOverallStatus(
  workflow: WorkflowRow,
  stages: WorkflowStageRow[],
  template: WorkflowTemplateRow | null,
): OverallStatus {
  // Terminal manual states win — service does not override them.
  if (["cancelled", "refunded", "expired", "on_hold"].includes(workflow.overall_status)) {
    return workflow.overall_status;
  }

  const now = Date.now();
  const dueMs = workflow.due_date ? new Date(workflow.due_date).getTime() : null;

  // Completion check (matches template.completion_rule).
  const requiredStages = stages.filter((s) => s.required_for_completion);
  const rule = template?.completion_rule ?? "all_required_stages_completed";

  const allRequiredMet = (() => {
    if (rule === "never_auto_completes") return false;
    if (requiredStages.length === 0) return false;
    if (rule === "quantity_reached_on_final_stages") {
      return requiredStages.every(
        (s) =>
          s.stage_type === "quantity" &&
          s.target_quantity != null &&
          Number(s.completed_quantity) >= Number(s.target_quantity),
      );
    }
    if (rule === "terminal_status") {
      return requiredStages.some((s) => s.status === "completed");
    }
    // all_required_stages_completed
    return requiredStages.every((s) => s.status === "completed" || s.status === "skipped");
  })();

  if (allRequiredMet) return "completed";

  if (workflow.payment_status === "unpaid" || workflow.payment_status === "partial") {
    return "pending_payment";
  }

  if (dueMs != null && dueMs < now) return "overdue";

  const anyInProgress = stages.some((s) => s.status === "in_progress");
  if (anyInProgress) return "in_progress";

  if (dueMs != null && dueMs - now < 7 * 86400_000) return "at_risk";

  return "not_started";
}

// ─── Assignments ─────────────────────────────────────────────────────────

export async function assignWorkflow(input: AssignmentInput) {
  const role = input.role ?? (input.makePrimary ? "primary_owner" : "observer");

  // Insert (or reactivate) the assignment.
  const { data: existing } = await supabaseAdmin
    .from("workflow_assignments")
    .select("id, active")
    .eq("workflow_id", input.workflowId)
    .eq("user_id", input.userId)
    .eq("role", role)
    .maybeSingle();

  if (existing) {
    if (!existing.active) {
      await supabaseAdmin
        .from("workflow_assignments")
        .update({ active: true, removed_at: null, assigned_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
  } else {
    await supabaseAdmin.from("workflow_assignments").insert({
      workflow_id: input.workflowId,
      user_id: input.userId,
      team: input.team ?? null,
      role,
      assigned_by: input.assignedBy ?? null,
    });
  }

  // Update the workflow's primary assigned_user_id if this is a primary_owner.
  if (role === "primary_owner" || input.makePrimary) {
    const workflow = await getWorkflow(input.workflowId);
    if (workflow) {
      await supabaseAdmin
        .from("workflows")
        .update({ assigned_user_id: input.userId, updated_by: input.assignedBy ?? null, version: workflow.version + 1 })
        .eq("id", input.workflowId)
        .eq("version", workflow.version);

      await recordEvent({
        workflowId: input.workflowId,
        eventType: "assignment_changed",
        previousValue: { assigned_user_id: workflow.assigned_user_id },
        newValue: { assigned_user_id: input.userId, role },
        changedFields: ["assigned_user_id"],
        actorUserId: input.assignedBy ?? null,
        actorType: "staff",
      });
    }
  } else {
    await recordEvent({
      workflowId: input.workflowId,
      eventType: "assignment_added",
      newValue: { user_id: input.userId, role },
      actorUserId: input.assignedBy ?? null,
      actorType: "staff",
    });
  }

  // Notify the newly-assigned user.
  try {
    const { dispatchNotification } = await import("./notifications");
    await dispatchNotification({
      workflowId: input.workflowId,
      trigger: "assignment.created",
    });
  } catch (err) {
    console.error("[workflows.service] assignment notification failed:", err);
  }
}

// ─── Notes ────────────────────────────────────────────────────────────────

export async function addNote(input: AddNoteInput) {
  const { data: note, error } = await supabaseAdmin
    .from("workflow_notes")
    .insert({
      workflow_id: input.workflowId,
      author_user_id: input.authorUserId ?? null,
      visibility: input.visibility,
      body: input.body,
      attachments: input.attachments ?? [],
      mentions: input.mentions ?? null,
    })
    .select("*")
    .single();

  if (error || !note) throw error ?? new Error("Note insert failed");

  await recordEvent({
    workflowId: input.workflowId,
    eventType: input.visibility === "customer" ? "customer_message_published" : "note_added",
    newValue: { visibility: input.visibility, body_preview: input.body.slice(0, 160) },
    actorUserId: input.authorUserId ?? null,
    actorType: "staff",
  });

  return note;
}

// ─── Shipments ───────────────────────────────────────────────────────────

export async function addShipment(input: AddShipmentInput) {
  const { data: ship, error } = await supabaseAdmin
    .from("workflow_shipments")
    .insert({
      workflow_id: input.workflowId,
      carrier: input.carrier ?? null,
      tracking_number: input.trackingNumber ?? null,
      quantity: input.quantity ?? 1,
      ship_date: input.shipDate ?? null,
      est_delivery_date: input.estDeliveryDate ?? null,
      actual_delivery_date: input.actualDeliveryDate ?? null,
      freight_provider: input.freightProvider ?? null,
      bol_url: input.bolUrl ?? null,
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  if (error || !ship) throw error ?? new Error("Shipment insert failed");

  await recordEvent({
    workflowId: input.workflowId,
    eventType: "shipment_added",
    newValue: {
      carrier: ship.carrier,
      tracking_number: ship.tracking_number,
      quantity: ship.quantity,
    },
    actorUserId: input.createdBy ?? null,
    actorType: "staff",
  });

  return ship;
}

// ─── Order sub-items (coffee orders attached to coffee_service) ──────────

export async function attachOrderToWorkflow(input: AttachOrderInput) {
  const { data: existing } = await supabaseAdmin
    .from("workflow_order_items")
    .select("*")
    .eq("workflow_id", input.workflowId)
    .eq("external_order_id", input.externalOrderId)
    .eq("external_order_type", input.externalOrderType ?? "coffee_order")
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from("workflow_order_items")
    .insert({
      workflow_id: input.workflowId,
      external_order_id: input.externalOrderId,
      external_order_type: input.externalOrderType ?? "coffee_order",
      order_number: input.orderNumber ?? null,
      order_total: input.orderTotal ?? null,
      order_status: input.orderStatus ?? null,
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error || !created) throw error ?? new Error("Order item insert failed");

  await recordEvent({
    workflowId: input.workflowId,
    eventType: "order_item_attached",
    newValue: { external_order_id: input.externalOrderId, external_order_type: input.externalOrderType ?? "coffee_order" },
    actorType: "system",
  });

  return created;
}

export async function updateOrderItem(input: UpdateOrderItemInput) {
  const { data: existing } = await supabaseAdmin
    .from("workflow_order_items")
    .select("*")
    .eq("id", input.orderItemId)
    .eq("workflow_id", input.workflowId)
    .maybeSingle();
  if (!existing) throw new Error("Order item not found");

  const patch: Record<string, unknown> = {};
  const changedFields: string[] = [];

  if (input.fulfillmentStatus && input.fulfillmentStatus !== existing.fulfillment_status) {
    patch.fulfillment_status = input.fulfillmentStatus;
    changedFields.push("fulfillment_status");
    if (input.fulfillmentStatus === "fulfilled") {
      patch.fulfilled_at = new Date().toISOString();
      patch.fulfilled_by = input.fulfilledBy ?? null;
    }
  }
  if (input.notes !== undefined) {
    patch.notes = input.notes;
    changedFields.push("notes");
  }

  if (changedFields.length === 0) return existing;

  const { data: updated } = await supabaseAdmin
    .from("workflow_order_items")
    .update(patch)
    .eq("id", input.orderItemId)
    .select("*")
    .single();

  await recordEvent({
    workflowId: input.workflowId,
    eventType: "order_item_updated",
    previousValue: {
      fulfillment_status: existing.fulfillment_status,
    },
    newValue: {
      fulfillment_status: (updated ?? existing).fulfillment_status,
    },
    changedFields,
    actorUserId: input.fulfilledBy ?? null,
    actorType: "staff",
  });

  return updated ?? existing;
}

// ─── Cancel / reopen / deadline change / status override ─────────────────

export async function cancelWorkflow(args: {
  workflowId: string;
  reason: string;
  cancelledBy: string | null;
}) {
  const workflow = await getWorkflow(args.workflowId);
  if (!workflow) throw new Error("Workflow not found");
  if (workflow.overall_status === "completed") {
    throw new Error("Cannot cancel a completed workflow");
  }

  const { data: updated } = await supabaseAdmin
    .from("workflows")
    .update({
      overall_status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: args.reason.slice(0, 500),
      updated_by: args.cancelledBy,
      version: workflow.version + 1,
    })
    .eq("id", workflow.id)
    .eq("version", workflow.version)
    .select("*")
    .single();

  await recordEvent({
    workflowId: workflow.id,
    eventType: "cancelled",
    previousValue: { overall_status: workflow.overall_status },
    newValue: { overall_status: "cancelled", reason: args.reason },
    actorUserId: args.cancelledBy,
    actorType: "staff",
    notes: args.reason,
  });

  return updated as WorkflowRow;
}

export async function reopenWorkflow(args: {
  workflowId: string;
  reason: string;
  reopenedBy: string | null;
}) {
  const workflow = await getWorkflow(args.workflowId);
  if (!workflow) throw new Error("Workflow not found");
  if (workflow.overall_status !== "cancelled" && workflow.overall_status !== "completed") {
    throw new Error("Only cancelled or completed workflows can be reopened");
  }

  const { data: updated } = await supabaseAdmin
    .from("workflows")
    .update({
      overall_status: "in_progress",
      cancelled_at: null,
      cancellation_reason: null,
      completed_at: null,
      updated_by: args.reopenedBy,
      version: workflow.version + 1,
    })
    .eq("id", workflow.id)
    .eq("version", workflow.version)
    .select("*")
    .single();

  await recordEvent({
    workflowId: workflow.id,
    eventType: "reopened",
    previousValue: { overall_status: workflow.overall_status },
    newValue: { overall_status: "in_progress", reason: args.reason },
    actorUserId: args.reopenedBy,
    actorType: "staff",
    notes: args.reason,
  });

  return updated as WorkflowRow;
}

export async function changeDeadline(args: {
  workflowId: string;
  newDueDate: string;
  reason: string;
  changedBy: string | null;
}) {
  const workflow = await getWorkflow(args.workflowId);
  if (!workflow) throw new Error("Workflow not found");

  const previousDueDate = workflow.due_date;

  const { data: updated } = await supabaseAdmin
    .from("workflows")
    .update({
      due_date: args.newDueDate,
      updated_by: args.changedBy,
      version: workflow.version + 1,
    })
    .eq("id", workflow.id)
    .eq("version", workflow.version)
    .select("*")
    .single();

  await recordEvent({
    workflowId: workflow.id,
    eventType: "deadline_changed",
    previousValue: { due_date: previousDueDate },
    newValue: { due_date: args.newDueDate, reason: args.reason },
    changedFields: ["due_date"],
    actorUserId: args.changedBy,
    actorType: "staff",
    notes: args.reason,
  });

  // Notify customer of the change.
  try {
    const { dispatchNotification } = await import("./notifications");
    await dispatchNotification({
      workflowId: workflow.id,
      trigger: "deadline.changed",
    });
  } catch (err) {
    console.error("[workflows.service] deadline notification failed:", err);
  }

  return updated as WorkflowRow;
}

export async function setOverallStatus(args: {
  workflowId: string;
  overallStatus: OverallStatus;
  reason: string;
  changedBy: string | null;
}) {
  const workflow = await getWorkflow(args.workflowId);
  if (!workflow) throw new Error("Workflow not found");
  if (workflow.overall_status === args.overallStatus) return workflow;

  const { data: updated } = await supabaseAdmin
    .from("workflows")
    .update({
      overall_status: args.overallStatus,
      updated_by: args.changedBy,
      version: workflow.version + 1,
      ...(args.overallStatus === "completed" && workflow.completed_at == null
        ? { completed_at: new Date().toISOString() }
        : {}),
    })
    .eq("id", workflow.id)
    .eq("version", workflow.version)
    .select("*")
    .single();

  await recordEvent({
    workflowId: workflow.id,
    eventType: "status_changed",
    previousValue: { overall_status: workflow.overall_status },
    newValue: { overall_status: args.overallStatus, reason: args.reason },
    changedFields: ["overall_status"],
    actorUserId: args.changedBy,
    actorType: "staff",
    notes: args.reason,
  });

  return updated as WorkflowRow;
}

// ─── Event audit helper ──────────────────────────────────────────────────

export async function recordEvent(args: {
  workflowId: string;
  stageId?: string;
  eventType: string;
  previousValue?: unknown;
  newValue?: unknown;
  changedFields?: string[];
  actorUserId?: string | null;
  actorType?: "staff" | "customer" | "system" | "webhook" | "cron";
  source?: string;
  changeKey?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("workflow_events").insert({
    workflow_id: args.workflowId,
    stage_id: args.stageId ?? null,
    event_type: args.eventType,
    previous_value: args.previousValue ?? null,
    new_value: args.newValue ?? null,
    changed_fields: args.changedFields ?? null,
    actor_user_id: args.actorUserId ?? null,
    actor_type: args.actorType ?? "staff",
    source: args.source ?? null,
    change_key: args.changeKey ?? null,
    notes: args.notes ?? null,
    metadata: args.metadata ?? {},
  });
}
