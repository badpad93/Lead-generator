/**
 * Workflows — zod validation schemas for API inputs.
 *
 * Every API route validates its body against one of these before touching
 * the DB. Enums are kept in sync with `types.ts`.
 */

import { z } from "zod";

const workflowTypeEnum = z.enum([
  "ai_machine_fulfillment",
  "location_services",
  "financing",
  "coffee_equipment",
  "coffee_service",
  "website_build",
]);

const sourceTypeEnum = z.enum([
  "agreement",
  "sales_order",
  "coffee_order",
  "coffee_agreement",
  "machine_listing_purchase",
  "location_request",
  "placement_agreement",
  "financing_application",
  "website_request",
  "legacy_backfill",
  "admin_manual",
]);

const stageStatusEnum = z.enum([
  "not_started",
  "in_progress",
  "blocked",
  "completed",
  "skipped",
]);

const overallStatusEnum = z.enum([
  "draft",
  "pending_payment",
  "ready_to_begin",
  "not_started",
  "in_progress",
  "waiting_on_customer",
  "waiting_on_vendor",
  "on_hold",
  "at_risk",
  "overdue",
  "completed",
  "cancelled",
  "refunded",
  "expired",
]);

const paymentStatusEnum = z.enum(["unpaid", "partial", "paid", "refunded", "na"]);

const priorityEnum = z.enum(["low", "normal", "high", "urgent"]);

const assignmentRoleEnum = z.enum([
  "primary_owner",
  "sales_rep",
  "financing_coordinator",
  "location_specialist",
  "fulfillment_coordinator",
  "shipping_coordinator",
  "coffee_service_rep",
  "manager",
  "observer",
]);

const noteVisibilityEnum = z.enum(["internal", "customer"]);

const primaryTeamEnum = z.enum(["fulfillment", "locations", "financing", "coffee"]);

const orderItemFulfillmentEnum = z.enum([
  "pending",
  "processing",
  "shipped",
  "fulfilled",
  "cancelled",
]);

// ─── Server-side create input (used by the service layer) ─────────────────
export const createWorkflowSchema = z.object({
  customerId: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  workflowType: workflowTypeEnum,
  sourceType: sourceTypeEnum,
  sourceId: z.string().uuid(),
  agreementId: z.string().uuid().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  coffeeOrderId: z.string().uuid().nullable().optional(),
  purchaseId: z.string().uuid().nullable().optional(),
  locationRequestId: z.string().uuid().nullable().optional(),
  placementContractId: z.string().uuid().nullable().optional(),
  financingApplicationId: z.string().uuid().nullable().optional(),
  websiteRequestId: z.string().uuid().nullable().optional(),
  productKey: z.string().max(120).nullable().optional(),
  productName: z.string().max(200).nullable().optional(),
  serviceId: z.string().max(120).nullable().optional(),
  quantityPurchased: z.number().nonnegative().default(1),
  paymentStatus: paymentStatusEnum.optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  priority: priorityEnum.optional(),
  primaryTeam: primaryTeamEnum.nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdBy: z.string().uuid().nullable().optional(),
  actorType: z.enum(["staff", "customer", "system", "webhook", "cron"]).optional(),
  suppressInitialCustomerEmail: z.boolean().optional(),
  importedFromLegacy: z.boolean().optional(),
});

export const updateStageSchema = z.object({
  workflowId: z.string().uuid(),
  stageKey: z.string().min(1).max(120),
  status: stageStatusEnum.optional(),
  completedQuantity: z.number().nonnegative().optional(),
  internalNotes: z.string().max(4000).optional(),
  customerMessage: z.string().max(2000).optional(),
  updatedBy: z.string().uuid().nullable().optional(),
  changeKey: z.string().max(200).optional(),
  allowOverTarget: z.boolean().optional(),
  actorType: z.enum(["staff", "customer", "system", "webhook", "cron"]).optional(),
  source: z.string().max(120).optional(),
});

export const assignmentSchema = z.object({
  workflowId: z.string().uuid(),
  userId: z.string().uuid(),
  role: assignmentRoleEnum.optional(),
  team: z.string().max(80).optional(),
  assignedBy: z.string().uuid().nullable().optional(),
  makePrimary: z.boolean().optional(),
});

export const addNoteSchema = z.object({
  workflowId: z.string().uuid(),
  body: z.string().min(1).max(4000),
  visibility: noteVisibilityEnum,
  authorUserId: z.string().uuid().nullable().optional(),
  attachments: z.array(z.unknown()).optional(),
  mentions: z.array(z.string().uuid()).optional(),
});

export const addShipmentSchema = z.object({
  workflowId: z.string().uuid(),
  carrier: z.string().max(120).optional(),
  trackingNumber: z.string().max(200).optional(),
  quantity: z.number().nonnegative().default(1),
  shipDate: z.string().datetime().optional(),
  estDeliveryDate: z.string().datetime().optional(),
  actualDeliveryDate: z.string().datetime().optional(),
  freightProvider: z.string().max(120).optional(),
  bolUrl: z.string().url().max(500).optional(),
  notes: z.string().max(2000).optional(),
  createdBy: z.string().uuid().nullable().optional(),
});

export const attachOrderSchema = z.object({
  workflowId: z.string().uuid(),
  externalOrderId: z.string().uuid(),
  externalOrderType: z.enum(["coffee_order", "sales_order", "other"]).optional(),
  orderNumber: z.string().max(120).optional(),
  orderTotal: z.number().optional(),
  orderStatus: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateOrderItemSchema = z.object({
  workflowId: z.string().uuid(),
  orderItemId: z.string().uuid(),
  fulfillmentStatus: orderItemFulfillmentEnum.optional(),
  notes: z.string().max(2000).optional(),
  fulfilledBy: z.string().uuid().nullable().optional(),
});

// Cancel / reopen / deadline change all live on separate endpoints so
// their audit trail is unambiguous.
export const cancelWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  cancelledBy: z.string().uuid().optional(),
});

export const reopenWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  reopenedBy: z.string().uuid().optional(),
});

export const changeDeadlineSchema = z.object({
  workflowId: z.string().uuid(),
  newDueDate: z.string().datetime(),
  reason: z.string().min(1).max(500),
  notifyCustomer: z.boolean().optional(),
  changedBy: z.string().uuid().optional(),
});

export const setOverallStatusSchema = z.object({
  workflowId: z.string().uuid(),
  overallStatus: overallStatusEnum,
  reason: z.string().min(1).max(500),
  changedBy: z.string().uuid().optional(),
});

// ─── Filters for list endpoints ───────────────────────────────────────────
export const listWorkflowsQuerySchema = z.object({
  workflowType: workflowTypeEnum.optional(),
  status: overallStatusEnum.optional(),
  assignedUserId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  agreementId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  unassigned: z.enum(["true", "false"]).optional(),
  priority: priorityEnum.optional(),
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  orderBy: z.enum(["due_date", "created_at", "updated_at", "priority"]).optional(),
  orderDir: z.enum(["asc", "desc"]).optional(),
});
