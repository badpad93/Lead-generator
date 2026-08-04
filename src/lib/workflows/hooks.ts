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

/**
 * Project a source row into a shape safe to snapshot into
 * workflow.metadata.source_intake. Strips columns that are noise for
 * "what did the customer submit" (system timestamps, internal-only IDs,
 * anything containing a secret). Everything else — including the
 * business context, contact info, and per-form fields — is copied
 * verbatim so whoever picks up the workflow has full context without
 * clicking back to the source table.
 */
function snapshotSourceIntake<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const DROP = new Set([
    "id", "created_at", "updated_at", "created_by", "updated_by",
    "deleted_at", "sign_token", "qb_invoice_id",
    "location_remaining_qb_invoice_id", "apex_placement_qb_invoice_id",
    "stripe_customer_id", "stripe_subscription_id", "stripe_account_id",
    "stripe_checkout_session_id", "stripe_payment_intent_id",
    "raw_stripe_event", "raw_webhook",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DROP.has(k)) continue;
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

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
        source_intake: snapshotSourceIntake(ag),
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
        source_intake: snapshotSourceIntake(ag),
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

  // Pull the original coffee_application intake so the fulfillment
  // team sees the customer's shipping address, contact, volume estimate,
  // notes, etc. — not just the agreement.
  const { data: application } = await supabaseAdmin
    .from("coffee_applications")
    .select("*")
    .eq("operator_id", customerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const coffeeIntake = {
    agreement: snapshotSourceIntake(ua),
    application: application ? snapshotSourceIntake(application) : null,
  };

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
    metadata: {
      source_agreement: userAgreementId,
      source_intake: coffeeIntake,
    },
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
    metadata: {
      source_agreement: userAgreementId,
      source_intake: coffeeIntake,
    },
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
  // Grab the full buyer intake so the fulfillment team sees buyer type,
  // business address, LLC status, location plan, timeline, power/space
  // flags, connectivity, shipping intent, etc.
  const { data: purchase } = await supabaseAdmin
    .from("machine_listing_purchases")
    .select("*")
    .eq("id", purchaseId)
    .maybeSingle();

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
    metadata: purchase ? { source_intake: snapshotSourceIntake(purchase) } : undefined,
    actorType: "system",
  });
}

// ─── Financing application ──────────────────────────────────────────────
export async function spawnFromFinancingApplication(
  applicationId: string,
  args: { customerId: string; companyId?: string },
): Promise<WorkflowRow | null> {
  // Load the full application row so the financing team sees the
  // 17-field intake (income, credit range, background flags, etc.)
  // without needing to click into the source table.
  const { data: application } = await supabaseAdmin
    .from("financing_applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

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
    metadata: application ? { source_intake: snapshotSourceIntake(application) } : undefined,
    actorType: "system",
  });
}

// ─── Website build request ──────────────────────────────────────────────
export async function spawnFromWebsiteRequest(
  requestId: string,
  args: { customerId: string; companyId?: string; siteName?: string },
): Promise<WorkflowRow | null> {
  // Pull the full wizard payload so the build team sees every step —
  // business, brand, domain, content, products, media, features,
  // contact, launch prefs — without opening a separate admin view.
  const { data: request } = await supabaseAdmin
    .from("website_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();

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
    metadata: request ? { source_intake: snapshotSourceIntake(request) } : undefined,
    actorType: "system",
  });
}

// ─── Coffee order → attach to coffee_service workflow ───────────────────
// Called from the coffee checkout QB-paid webhook AND from any code
// path that needs to make sure a coffee order shows up in the CRM.
//
// If no active coffee_service workflow exists for this customer, one
// is auto-spawned before attaching — legacy customers who signed
// their coffee agreement before this system launched no longer fall
// through the cracks. The spawned workflow lands with
// primary_team='coffee' + workflow_type='coffee_service' so it counts
// against the coffee-team unassigned bucket in the workload view.
export async function attachCoffeeOrderToServiceWorkflow(args: {
  customerId: string;
  coffeeOrderId: string;
  orderNumber?: string;
  orderTotal?: number;
  orderStatus?: string;
}): Promise<{ workflowId: string; attached: boolean; spawned: boolean } | null> {
  const { data: existing } = await supabaseAdmin
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

  let workflowId: string;
  let spawned = false;

  if (existing) {
    workflowId = existing.id;
  } else {
    // Auto-spawn a coffee_service workflow for this customer. Use a
    // deterministic (source_type, source_id) so retries within the
    // same call don't create duplicates — the DB's idempotency index
    // covers (source_type, source_id, workflow_type, product_key).
    // COFFEE_DEFAULT_ASSIGNEE_ID (if set) becomes the primary owner so
    // this shows up on someone's workload immediately; otherwise it
    // sits in the coffee-team "unassigned" bucket for admin to route.
    const { getOrCreateWorkflow } = await import("./service");
    const defaultAssignee = process.env.COFFEE_DEFAULT_ASSIGNEE_ID || null;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, company_name")
      .eq("id", args.customerId)
      .maybeSingle();
    const displayName =
      profile?.company_name || profile?.full_name || profile?.email || "customer";

    const result = await getOrCreateWorkflow({
      customerId: args.customerId,
      workflowType: "coffee_service",
      sourceType: "coffee_agreement",
      // Deterministic per-customer source_id so subsequent auto-spawns
      // (from later orders arriving before an admin creates a proper
      // workflow) resolve to the same row via the idempotency index.
      sourceId: args.customerId,
      primaryTeam: "coffee",
      assignedUserId: defaultAssignee,
      title: `Coffee Service — ${displayName}`,
      actorType: "system",
      // Skip the "workflow created" email for auto-spawned service
      // workflows — legacy customers didn't ask to be onboarded to a
      // new workflow system and getting a random email would confuse.
      suppressInitialCustomerEmail: true,
    });
    workflowId = result.workflow.id;
    spawned = result.created;
  }

  const { attachOrderToWorkflow } = await import("./service");
  const item = await attachOrderToWorkflow({
    workflowId,
    externalOrderId: args.coffeeOrderId,
    externalOrderType: "coffee_order",
    orderNumber: args.orderNumber,
    orderTotal: args.orderTotal,
    orderStatus: args.orderStatus,
  });

  // Advance "initial_order_placed" → "recurring_active" on first order.
  // Best-effort — the template may not have these stage keys (custom
  // templates); we swallow those errors.
  await updateStage({
    workflowId,
    stageKey: "initial_order_placed",
    status: "completed",
    actorType: "system",
    source: "coffee_checkout",
    changeKey: `coffee_order_placed:${args.coffeeOrderId}`,
  }).catch(() => null);
  await updateStage({
    workflowId,
    stageKey: "recurring_active",
    status: "in_progress",
    actorType: "system",
    source: "coffee_checkout",
    changeKey: `coffee_order_active:${args.coffeeOrderId}`,
  }).catch(() => null);

  return { workflowId, attached: !!item, spawned };
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

// Assignee resolution runs asynchronously via the notification service
// (WORKFLOWS_TEAM_EMAIL_* env vars provide the fallback recipient when
// the workflow has no direct assignee). We create every workflow
// initially unassigned so the "Unassigned" saved view surfaces it for
// the appropriate team.
function teamEmailAssignee(
  _team: "fulfillment" | "locations" | "financing" | "coffee",
): string | null {
  void _team;
  return null;
}
