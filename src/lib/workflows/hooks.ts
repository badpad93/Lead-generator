/**
 * Workflows — integration hooks.
 *
 * Domain-specific fan-out helpers that translate an existing business
 * event (agreement fully executed, purchase completed, location request
 * submitted, etc.) into one or more workflow.createFromSource calls.
 *
 * All hooks are best-effort — failures never break the underlying
 * business transaction. A wrapping try/catch is the caller's
 * responsibility; this module logs failures via workflow_events but does
 * not throw upward for domain callers unless the caller passes
 * `{ throwOnError: true }` (only used by admin-manual paths).
 */

import { supabaseAdmin } from "../supabaseAdmin";
import { getOrCreateWorkflow, updateStage } from "./service";
import type { CreateWorkflowInput, WorkflowRow } from "./types";

// ─── Purchase agreement (machine + location placement) ──────────────────
//
// Called from generateAgreementPdf.handleFullySignedAgreement when both
// parties have signed. Fans out based on the agreement's include_*
// toggles and agreement_type.
export async function spawnFromPurchaseAgreement(
  agreementId: string,
): Promise<WorkflowRow[]> {
  const { data: ag } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle();
  if (!ag) return [];

  const customerId = await resolveCustomerId({
    operatorId: ag.operator_id,
    operatorEmail: ag.operator_email,
    accountId: ag.account_id,
  });
  if (!customerId) return [];

  const companyId = ag.account_id ?? null;
  const spawned: WorkflowRow[] = [];

  const isLocationPlacement = ag.agreement_type === "location_placement";

  // AI machine fulfillment — spawn when the machine section is included
  // and quantity > 0 (skip for pure location placement agreements).
  if (!isLocationPlacement && ag.include_equipment !== false && Number(ag.machine_quantity) > 0) {
    const result = await safeCreate({
      customerId,
      companyId,
      workflowType: "ai_machine_fulfillment",
      sourceType: "agreement",
      sourceId: agreementId,
      agreementId,
      orderId: ag.order_id ?? undefined,
      productKey: `machine:${ag.machine_model ?? "vendera"}`,
      productName: `${ag.machine_quantity} × ${ag.machine_model ?? "AI Machine"}`,
      quantityPurchased: Number(ag.machine_quantity),
      paymentStatus: ag.apex_placement_paid_at ? "paid" : "unpaid",
      primaryTeam: "fulfillment",
      assignedUserId: teamEmailAssignee("fulfillment"),
      metadata: {
        machine_model: ag.machine_model,
        unit_price: ag.machine_unit_price,
        total: ag.total_due_prior_to_procurement,
        operator_company: ag.operator_company_name,
      },
      actorType: "system",
    });
    if (result) spawned.push(result);
  }

  // Location services — spawn on either a location_placement agreement
  // or a machine-purchase agreement that includes location services.
  const includeLocationServices =
    isLocationPlacement || ag.include_location_services === true;

  if (includeLocationServices) {
    const locationQuantity = isLocationPlacement
      ? Number(ag.placement_machine_count) || 1
      : Number(ag.locations_purchased) || Number(ag.machine_quantity) || 1;

    // Look up the marketplace contract (if handleFullySignedAgreement
    // has already created one) so the workflow points at it and both
    // sides display the same state.
    const placementContractId = ag.marketplace_contract_id ?? null;

    const result = await safeCreate({
      customerId,
      companyId,
      workflowType: "location_services",
      sourceType: isLocationPlacement ? "placement_agreement" : "agreement",
      sourceId: agreementId,
      agreementId,
      orderId: ag.order_id ?? undefined,
      placementContractId: placementContractId ?? undefined,
      productKey: "location_services",
      productName: `Location Services — ${locationQuantity} location${locationQuantity > 1 ? "s" : ""}`,
      quantityPurchased: locationQuantity,
      paymentStatus: ag.apex_placement_paid_at ? "paid" : "unpaid",
      primaryTeam: "locations",
      assignedUserId: teamEmailAssignee("locations"),
      metadata: {
        commission_type: ag.commission_type,
        commission_pct: ag.commission_pct,
        placement_term_months: ag.placement_term_months,
        location_business_name: ag.location_business_name,
        location_city: ag.location_city,
        location_state: ag.location_state,
        send_to_marketplace: ag.send_to_marketplace,
        marketplace_contract_id: placementContractId,
      },
      actorType: "system",
    });
    if (result) spawned.push(result);
  }

  return spawned;
}

// ─── Coffee supply agreement ─────────────────────────────────────────────
export async function spawnFromCoffeeAgreement(
  userAgreementId: string,
): Promise<WorkflowRow[]> {
  const { data: ua } = await supabaseAdmin
    .from("user_agreements")
    .select("*")
    .eq("id", userAgreementId)
    .maybeSingle();
  if (!ua) return [];
  if (ua.agreement_type !== "coffee_supply") return [];
  if (ua.status !== "fully_executed" && ua.status !== "legacy_approved") return [];

  const customerId = ua.user_id;
  const spawned: WorkflowRow[] = [];

  // Equipment commitment — quantity comes from agreement metadata if
  // recorded; otherwise defaults to 1 (single brewer/single account).
  const committedQty =
    Number((ua.metadata as Record<string, unknown> | null)?.equipment_quantity) || 1;

  const equipmentResult = await safeCreate({
    customerId,
    workflowType: "coffee_equipment",
    sourceType: "coffee_agreement",
    sourceId: userAgreementId,
    productKey: "coffee_equipment",
    productName: `Coffee Equipment — ${committedQty} unit${committedQty > 1 ? "s" : ""}`,
    quantityPurchased: committedQty,
    paymentStatus: "na",
    primaryTeam: "coffee",
    assignedUserId: teamEmailAssignee("coffee"),
    metadata: { source_agreement: userAgreementId },
    actorType: "system",
  });
  if (equipmentResult) spawned.push(equipmentResult);

  // Recurring service — never auto-completes; coffee orders attach as
  // sub-items.
  const serviceResult = await safeCreate({
    customerId,
    workflowType: "coffee_service",
    sourceType: "coffee_agreement",
    sourceId: userAgreementId,
    productKey: "coffee_service",
    productName: "Coffee Service (Recurring)",
    quantityPurchased: 1,
    paymentStatus: "na",
    primaryTeam: "coffee",
    assignedUserId: teamEmailAssignee("coffee"),
    metadata: { source_agreement: userAgreementId },
    actorType: "system",
  });
  if (serviceResult) spawned.push(serviceResult);

  return spawned;
}

// ─── Location Services request (customer intake) ────────────────────────
export async function spawnFromLocationRequest(
  requestId: string,
  args: {
    customerId: string;
    quantity: number;
    deadlineDays?: number;
    companyId?: string;
  },
): Promise<WorkflowRow | null> {
  return safeCreate({
    customerId: args.customerId,
    companyId: args.companyId ?? null,
    workflowType: "location_services",
    sourceType: "location_request",
    sourceId: requestId,
    locationRequestId: requestId,
    productKey: "location_services",
    productName: `Location Services — ${args.quantity} location${args.quantity > 1 ? "s" : ""}`,
    quantityPurchased: args.quantity,
    paymentStatus: "paid",
    startDate: new Date().toISOString(),
    dueDate: args.deadlineDays
      ? new Date(Date.now() + args.deadlineDays * 86400_000).toISOString()
      : undefined,
    primaryTeam: "locations",
    assignedUserId: teamEmailAssignee("locations"),
    actorType: "system",
  });
}

// ─── Machine listing P2P purchase ───────────────────────────────────────
export async function spawnFromMachineListingPurchase(
  purchaseId: string,
  args: {
    customerId: string;
    listingId: string;
    quantity?: number;
    machineTitle?: string;
  },
): Promise<WorkflowRow | null> {
  return safeCreate({
    customerId: args.customerId,
    workflowType: "ai_machine_fulfillment",
    sourceType: "machine_listing_purchase",
    sourceId: purchaseId,
    purchaseId,
    productKey: `machine_listing:${args.listingId}`,
    productName: args.machineTitle ?? "Used Machine Purchase",
    quantityPurchased: args.quantity ?? 1,
    paymentStatus: "paid",
    primaryTeam: "fulfillment",
    assignedUserId: teamEmailAssignee("fulfillment"),
    actorType: "system",
  });
}

// ─── Financing application ──────────────────────────────────────────────
export async function spawnFromFinancingApplication(
  applicationId: string,
  args: { customerId: string; companyId?: string },
): Promise<WorkflowRow | null> {
  return safeCreate({
    customerId: args.customerId,
    companyId: args.companyId ?? null,
    workflowType: "financing",
    sourceType: "financing_application",
    sourceId: applicationId,
    financingApplicationId: applicationId,
    productKey: "financing",
    productName: "SBA Financing Application",
    quantityPurchased: 1,
    paymentStatus: "na",
    primaryTeam: "financing",
    assignedUserId: teamEmailAssignee("financing"),
    actorType: "system",
  });
}

// ─── Website build request ──────────────────────────────────────────────
export async function spawnFromWebsiteRequest(
  requestId: string,
  args: { customerId: string; companyId?: string; siteName?: string },
): Promise<WorkflowRow | null> {
  return safeCreate({
    customerId: args.customerId,
    companyId: args.companyId ?? null,
    workflowType: "website_build",
    sourceType: "website_request",
    sourceId: requestId,
    websiteRequestId: requestId,
    productKey: "website_build",
    productName: args.siteName ? `Website — ${args.siteName}` : "Website Build",
    quantityPurchased: 1,
    paymentStatus: "na",
    primaryTeam: "fulfillment",
    assignedUserId: teamEmailAssignee("fulfillment"),
    actorType: "system",
  });
}

// ─── Coffee order → attach to coffee_service workflow ───────────────────
// Called from the coffee checkout QB-paid webhook.
export async function attachCoffeeOrderToServiceWorkflow(args: {
  customerId: string;
  coffeeOrderId: string;
  orderNumber?: string;
  orderTotal?: number;
  orderStatus?: string;
}): Promise<{ workflowId: string; attached: boolean } | null> {
  // Find the customer's active coffee_service workflow. If none exists
  // yet (they signed the agreement before this system launched), skip —
  // legacy backfill can create one.
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id")
    .eq("customer_id", args.customerId)
    .eq("workflow_type", "coffee_service")
    .in("overall_status", [
      "not_started",
      "in_progress",
      "waiting_on_customer",
      "waiting_on_vendor",
      "at_risk",
      "ready_to_begin",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!workflow) return null;

  const { attachOrderToWorkflow } = await import("./service");
  const item = await attachOrderToWorkflow({
    workflowId: workflow.id,
    externalOrderId: args.coffeeOrderId,
    externalOrderType: "coffee_order",
    orderNumber: args.orderNumber,
    orderTotal: args.orderTotal,
    orderStatus: args.orderStatus,
  });

  // Advance "initial_order_placed" → "recurring_active" on first order.
  await updateStage({
    workflowId: workflow.id,
    stageKey: "initial_order_placed",
    status: "completed",
    actorType: "system",
    source: "coffee_checkout",
    changeKey: `coffee_order_placed:${args.coffeeOrderId}`,
  }).catch(() => null);
  await updateStage({
    workflowId: workflow.id,
    stageKey: "recurring_active",
    status: "in_progress",
    actorType: "system",
    source: "coffee_checkout",
    changeKey: `coffee_order_active:${args.coffeeOrderId}`,
  }).catch(() => null);

  return { workflowId: workflow.id, attached: !!item };
}

// ─── Marketplace submission (PP) → advance location_services workflow ──
// Called when an operator accepts a placement submission — bumps the
// "secured" quantity on the linked location_services workflow.
export async function advanceLocationSecuredForContract(args: {
  placementContractId: string;
  delta?: number;
  actorUserId?: string | null;
  changeKey?: string;
}): Promise<void> {
  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id, quantity_purchased")
    .eq("placement_contract_id", args.placementContractId)
    .eq("workflow_type", "location_services")
    .maybeSingle();

  if (!workflow) return;

  const { data: securedStage } = await supabaseAdmin
    .from("workflow_stages")
    .select("completed_quantity")
    .eq("workflow_id", workflow.id)
    .eq("stage_key", "secured")
    .maybeSingle();

  const currentSecured = Number(securedStage?.completed_quantity ?? 0);
  const newSecured = currentSecured + (args.delta ?? 1);

  await updateStage({
    workflowId: workflow.id,
    stageKey: "secured",
    completedQuantity: newSecured,
    updatedBy: args.actorUserId ?? null,
    actorType: "system",
    source: "marketplace_submission_accepted",
    changeKey: args.changeKey,
  }).catch(() => null);
}

// ─── Helpers ─────────────────────────────────────────────────────────────
async function safeCreate(input: CreateWorkflowInput): Promise<WorkflowRow | null> {
  try {
    const { workflow } = await getOrCreateWorkflow(input);
    return workflow;
  } catch (err) {
    // Log but don't throw — a workflow failure never breaks the caller.
    console.error("[workflows.hooks] safeCreate failed:", err);
    return null;
  }
}

async function resolveCustomerId(args: {
  operatorId: string | null;
  operatorEmail: string | null;
  accountId: string | null;
}): Promise<string | null> {
  if (args.operatorId) return args.operatorId;
  if (args.operatorEmail) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", args.operatorEmail.trim())
      .maybeSingle();
    if (data) return data.id as string;
  }
  if (args.accountId) {
    // Best-effort: look up account owner_user_id if present
    const { data } = await supabaseAdmin
      .from("sales_accounts")
      .select("owner_user_id")
      .eq("id", args.accountId)
      .maybeSingle();
    return (data as { owner_user_id?: string } | null)?.owner_user_id ?? null;
  }
  return null;
}

// Assignee resolution via team-email env vars. Returns the user_id of
// the profile whose email matches the env var; null if no match. Falls
// back to unassigned so the workflow is still created.
function teamEmailAssignee(_team: "fulfillment" | "locations" | "financing" | "coffee"): string | null {
  // Placeholder — resolved async at read time by the API layer using
  // WORKFLOWS_TEAM_EMAIL_* env vars. Passing null here means the
  // workflow is initially unassigned and shows in "unassigned" filters
  // for the appropriate team; the auto-assign cron then picks it up.
  return null;
}
