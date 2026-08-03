/**
 * Workflows — shared TypeScript types.
 *
 * These types mirror the migration-125 schema exactly. Every field's
 * shape and nullability matches what the database will return, so
 * consumers can treat rows as `Workflow` without re-mapping.
 */

// Built-in workflow types + a wildcard for admin-created custom
// templates (workflow_type keys prefixed with "custom:"). Anywhere the
// exact built-in narrowing matters, use the BuiltInWorkflowType alias.
export type BuiltInWorkflowType =
  | "ai_machine_fulfillment"
  | "location_services"
  | "financing"
  | "coffee_equipment"
  | "coffee_service"
  | "website_build";

export type WorkflowType = BuiltInWorkflowType | (string & { readonly __brand?: "workflow_type" });

export type WorkflowSourceType =
  | "agreement"
  | "sales_order"
  | "coffee_order"
  | "coffee_agreement"
  | "machine_listing_purchase"
  | "location_request"
  | "placement_agreement"
  | "financing_application"
  | "website_request"
  | "legacy_backfill"
  | "admin_manual";

export type StageType =
  | "quantity"
  | "status"
  | "date"
  | "approval"
  | "document"
  | "milestone";

export type StageStatus =
  | "not_started"
  | "in_progress"
  | "blocked"
  | "completed"
  | "skipped";

export type OverallStatus =
  | "draft"
  | "pending_payment"
  | "ready_to_begin"
  | "not_started"
  | "in_progress"
  | "waiting_on_customer"
  | "waiting_on_vendor"
  | "on_hold"
  | "at_risk"
  | "overdue"
  | "completed"
  | "cancelled"
  | "refunded"
  | "expired";

export type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded" | "na";

export type Priority = "low" | "normal" | "high" | "urgent";

export type AssignmentRole =
  | "primary_owner"
  | "sales_rep"
  | "financing_coordinator"
  | "location_specialist"
  | "fulfillment_coordinator"
  | "shipping_coordinator"
  | "coffee_service_rep"
  | "manager"
  | "observer";

export type NoteVisibility = "internal" | "customer";

export type ActorType = "staff" | "customer" | "system" | "webhook" | "cron";

export type CompletionRule =
  | "all_required_stages_completed"
  | "quantity_reached_on_final_stages"
  | "terminal_status"
  | "never_auto_completes";

export type OrderItemFulfillmentStatus =
  | "pending"
  | "processing"
  | "shipped"
  | "fulfilled"
  | "cancelled";

export type PrimaryTeam =
  | "fulfillment"
  | "locations"
  | "financing"
  | "coffee";

// ─── Row shapes (as returned from the DB) ────────────────────────────────

export interface WorkflowTemplateRow {
  id: string;
  workflow_type: string;
  version: number;
  title: string;
  description: string | null;
  default_deadline_days: number | null;
  quantity_based: boolean;
  completion_rule: CompletionRule;
  active: boolean;
  workload_weight: number;
  is_custom: boolean;
  category: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowTemplateStageRow {
  id: string;
  template_id: string;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  stage_type: StageType;
  required_for_completion: boolean;
  customer_visible: boolean;
  default_customer_message: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
}

export interface WorkflowRow {
  id: string;
  workflow_number: string;
  customer_id: string;
  company_id: string | null;
  workflow_type: WorkflowType;
  template_id: string | null;
  template_version: number | null;
  title: string;
  description: string | null;
  source_type: WorkflowSourceType;
  source_id: string;
  agreement_id: string | null;
  order_id: string | null;
  coffee_order_id: string | null;
  purchase_id: string | null;
  location_request_id: string | null;
  placement_contract_id: string | null;
  financing_application_id: string | null;
  website_request_id: string | null;
  product_key: string | null;
  product_name: string | null;
  service_id: string | null;
  quantity_purchased: number;
  quantity_completed: number;
  payment_status: PaymentStatus;
  overall_status: OverallStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  assigned_user_id: string | null;
  primary_team: PrimaryTeam | null;
  show_assignee_to_customer: boolean;
  imported_from_legacy: boolean;
  suppress_initial_customer_email: boolean;
  created_by: string | null;
  updated_by: string | null;
  version: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStageRow {
  id: string;
  workflow_id: string;
  template_stage_id: string | null;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  stage_type: StageType;
  status: StageStatus;
  target_quantity: number | null;
  completed_quantity: number;
  customer_visible: boolean;
  required_for_completion: boolean;
  internal_notes: string | null;
  customer_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_by: string | null;
  version: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WorkflowEventRow {
  id: string;
  workflow_id: string;
  stage_id: string | null;
  event_type: string;
  previous_value: unknown;
  new_value: unknown;
  changed_fields: string[] | null;
  actor_user_id: string | null;
  actor_type: ActorType;
  source: string | null;
  change_key: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowAssignmentRow {
  id: string;
  workflow_id: string;
  user_id: string;
  team: string | null;
  role: AssignmentRole;
  assigned_by: string | null;
  assigned_at: string;
  removed_at: string | null;
  active: boolean;
}

export interface WorkflowNoteRow {
  id: string;
  workflow_id: string;
  author_user_id: string | null;
  visibility: NoteVisibility;
  body: string;
  attachments: unknown[];
  mentions: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowShipmentRow {
  id: string;
  workflow_id: string;
  carrier: string | null;
  tracking_number: string | null;
  quantity: number;
  ship_date: string | null;
  est_delivery_date: string | null;
  actual_delivery_date: string | null;
  freight_provider: string | null;
  bol_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowOrderItemRow {
  id: string;
  workflow_id: string;
  external_order_id: string;
  external_order_type: "coffee_order" | "sales_order" | "other";
  order_number: string | null;
  order_total: number | null;
  order_status: string | null;
  fulfillment_status: OrderItemFulfillmentStatus;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Input shapes (what callers pass to the service) ─────────────────────

export interface CreateWorkflowInput {
  customerId: string;
  companyId?: string | null;
  workflowType: WorkflowType;
  sourceType: WorkflowSourceType;
  sourceId: string;
  agreementId?: string | null;
  orderId?: string | null;
  coffeeOrderId?: string | null;
  purchaseId?: string | null;
  locationRequestId?: string | null;
  placementContractId?: string | null;
  financingApplicationId?: string | null;
  websiteRequestId?: string | null;
  productKey?: string | null;
  productName?: string | null;
  serviceId?: string | null;
  quantityPurchased?: number;
  paymentStatus?: PaymentStatus;
  startDate?: string;
  dueDate?: string;
  priority?: Priority;
  primaryTeam?: PrimaryTeam | null;
  assignedUserId?: string | null;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  actorType?: ActorType;
  suppressInitialCustomerEmail?: boolean;
  importedFromLegacy?: boolean;
}

export interface UpdateStageInput {
  workflowId: string;
  stageKey: string;
  status?: StageStatus;
  completedQuantity?: number;
  internalNotes?: string;
  customerMessage?: string;
  updatedBy?: string | null;
  changeKey?: string;
  allowOverTarget?: boolean;
  actorType?: ActorType;
  source?: string;
}

export interface AssignmentInput {
  workflowId: string;
  userId: string;
  role?: AssignmentRole;
  team?: string;
  assignedBy?: string | null;
  makePrimary?: boolean;
}

export interface AddNoteInput {
  workflowId: string;
  body: string;
  visibility: NoteVisibility;
  authorUserId?: string | null;
  attachments?: unknown[];
  mentions?: string[];
}

export interface AddShipmentInput {
  workflowId: string;
  carrier?: string;
  trackingNumber?: string;
  quantity?: number;
  shipDate?: string;
  estDeliveryDate?: string;
  actualDeliveryDate?: string;
  freightProvider?: string;
  bolUrl?: string;
  notes?: string;
  createdBy?: string | null;
}

export interface AttachOrderInput {
  workflowId: string;
  externalOrderId: string;
  externalOrderType?: "coffee_order" | "sales_order" | "other";
  orderNumber?: string;
  orderTotal?: number;
  orderStatus?: string;
  notes?: string;
}

export interface UpdateOrderItemInput {
  workflowId: string;
  orderItemId: string;
  fulfillmentStatus?: OrderItemFulfillmentStatus;
  notes?: string;
  fulfilledBy?: string | null;
}

// ─── Permission strings (checked in API routes) ───────────────────────────

export type WorkflowPermission =
  | "workflows.view_all"
  | "workflows.view_assigned"
  | "workflows.view_own"
  | "workflows.create"
  | "workflows.edit_status"
  | "workflows.edit_quantity"
  | "workflows.edit_deadline"
  | "workflows.assign"
  | "workflows.add_internal_notes"
  | "workflows.publish_customer_updates"
  | "workflows.cancel"
  | "workflows.reopen"
  | "workflows.delete"
  | "workflows.manage_templates"
  | "workflows.override_validation";
