/**
 * Workflow template definitions.
 *
 * Each template is the canonical stage list for a workflow type. The
 * service layer copies these into workflow_stages when a workflow is
 * created, so this file is the single source of truth for what stages
 * a given workflow type has.
 *
 * A boot-time `syncWorkflowTemplates()` call upserts these into the DB
 * so the admin template editor and any downstream consumers can query
 * them by workflow_type + version.
 */

import type {
  CompletionRule,
  StageType,
  WorkflowType,
} from "./types";

export interface TemplateStageDef {
  key: string;
  name: string;
  type: StageType;
  order: number;
  requiredForCompletion: boolean;
  customerVisible: boolean;
  defaultCustomerMessage?: string;
  description?: string;
}

export interface TemplateDef {
  workflowType: WorkflowType;
  version: number;
  title: string;
  description: string;
  defaultDeadlineDays: number | null;
  quantityBased: boolean;
  completionRule: CompletionRule;
  primaryTeam?: "fulfillment" | "locations" | "financing" | "coffee";
  stages: TemplateStageDef[];
}

// ─── AI machine fulfillment ──────────────────────────────────────────────
// Completion requires BOTH installed=purchased AND activated=purchased
// (per business decision). Delivered is tracked but not the final gate.
const aiMachineFulfillment: TemplateDef = {
  workflowType: "ai_machine_fulfillment",
  version: 1,
  title: "AI Cooler Fulfillment",
  description: "Ordering, shipping, delivery, installation, and activation of AI Coolers / vending machines.",
  defaultDeadlineDays: null,
  quantityBased: true,
  completionRule: "quantity_reached_on_final_stages",
  primaryTeam: "fulfillment",
  stages: [
    {
      key: "payment_confirmed",
      name: "Payment Confirmed",
      type: "status",
      order: 10,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Payment received and confirmed.",
    },
    {
      key: "ordered",
      name: "Ordered",
      type: "quantity",
      order: 20,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Machines ordered from the manufacturer.",
    },
    {
      key: "shipped",
      name: "Shipped",
      type: "quantity",
      order: 30,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Machines shipped — tracking details posted below.",
    },
    {
      key: "delivered",
      name: "Delivered",
      type: "quantity",
      order: 40,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Machines delivered.",
    },
    {
      key: "installed",
      name: "Installed",
      type: "quantity",
      order: 50,
      requiredForCompletion: true,
      customerVisible: true,
      defaultCustomerMessage: "Machines installed on location.",
    },
    {
      key: "activated",
      name: "Activated",
      type: "quantity",
      order: 60,
      requiredForCompletion: true,
      customerVisible: true,
      defaultCustomerMessage: "Machines activated and live.",
    },
  ],
};

// ─── Location services ──────────────────────────────────────────────────
// Default deadline 60 days from start; primary progress metric is
// "secured" vs purchased.
const locationServices: TemplateDef = {
  workflowType: "location_services",
  version: 1,
  title: "Location Services",
  description: "Finding, securing, and installing customer-purchased locations.",
  defaultDeadlineDays: 60,
  quantityBased: true,
  completionRule: "quantity_reached_on_final_stages",
  primaryTeam: "locations",
  stages: [
    {
      key: "payment_confirmed",
      name: "Payment Confirmed",
      type: "status",
      order: 10,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Deposit and authorization confirmed.",
    },
    {
      key: "requirements_received",
      name: "Requirements Received",
      type: "status",
      order: 20,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "We have your location requirements.",
    },
    {
      key: "search_in_progress",
      name: "Search In Progress",
      type: "status",
      order: 30,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Actively searching for locations that match your requirements.",
    },
    {
      key: "candidates_identified",
      name: "Candidates Identified",
      type: "quantity",
      order: 40,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Candidate locations identified for your review.",
    },
    {
      key: "locations_presented",
      name: "Locations Presented",
      type: "quantity",
      order: 50,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Locations presented for your decision.",
    },
    {
      key: "customer_approvals",
      name: "Customer Approvals",
      type: "quantity",
      order: 60,
      requiredForCompletion: false,
      customerVisible: true,
    },
    {
      key: "secured",
      name: "Locations Secured",
      type: "quantity",
      order: 70,
      requiredForCompletion: false,
      customerVisible: true,
      defaultCustomerMessage: "Location agreements secured with the venue.",
    },
    {
      key: "installation_coordination",
      name: "Installation Coordination",
      type: "status",
      order: 80,
      requiredForCompletion: false,
      customerVisible: true,
    },
    {
      key: "completed",
      name: "Completed",
      type: "quantity",
      order: 90,
      requiredForCompletion: true,
      customerVisible: true,
      defaultCustomerMessage: "Location service completed.",
    },
  ],
};

// ─── Financing ──────────────────────────────────────────────────────────
// Single "milestone" stage — the stage's own status field walks through
// the 13-value pipeline. Completion when a terminal status is set.
const financing: TemplateDef = {
  workflowType: "financing",
  version: 1,
  title: "Financing Application",
  description: "SBA / equipment financing application lifecycle.",
  defaultDeadlineDays: 60,
  quantityBased: false,
  completionRule: "terminal_status",
  primaryTeam: "financing",
  stages: [
    { key: "application_started", name: "Application Started", type: "milestone", order: 10, requiredForCompletion: false, customerVisible: true },
    { key: "application_submitted", name: "Application Submitted", type: "milestone", order: 20, requiredForCompletion: false, customerVisible: true },
    { key: "documents_requested", name: "Documents Requested", type: "milestone", order: 30, requiredForCompletion: false, customerVisible: true, defaultCustomerMessage: "We need additional documents to move forward." },
    { key: "documents_received", name: "Documents Received", type: "milestone", order: 40, requiredForCompletion: false, customerVisible: true },
    { key: "under_review", name: "Under Review", type: "milestone", order: 50, requiredForCompletion: false, customerVisible: true },
    { key: "additional_info_required", name: "Additional Info Required", type: "milestone", order: 60, requiredForCompletion: false, customerVisible: true, defaultCustomerMessage: "Additional information is required to complete underwriting." },
    { key: "pre_approved", name: "Pre-Approved", type: "milestone", order: 70, requiredForCompletion: false, customerVisible: true, defaultCustomerMessage: "You've been pre-approved." },
    { key: "approved", name: "Approved", type: "milestone", order: 80, requiredForCompletion: false, customerVisible: true, defaultCustomerMessage: "Financing approved." },
    { key: "funding_pending", name: "Funding Pending", type: "milestone", order: 90, requiredForCompletion: false, customerVisible: true },
    { key: "funded", name: "Funded", type: "milestone", order: 100, requiredForCompletion: true, customerVisible: true, defaultCustomerMessage: "Funds have been disbursed." },
    // Terminal negative outcomes — reached via manual status update rather than sequence.
    { key: "declined", name: "Declined", type: "milestone", order: 110, requiredForCompletion: false, customerVisible: true },
    { key: "cancelled", name: "Cancelled", type: "milestone", order: 120, requiredForCompletion: false, customerVisible: true },
    { key: "expired", name: "Expired", type: "milestone", order: 130, requiredForCompletion: false, customerVisible: true },
  ],
};

// ─── Coffee equipment ───────────────────────────────────────────────────
const coffeeEquipment: TemplateDef = {
  workflowType: "coffee_equipment",
  version: 1,
  title: "Coffee Equipment Fulfillment",
  description: "Ordering, shipping, delivery, and installation of coffee equipment (brewers, grinders, etc.).",
  defaultDeadlineDays: null,
  quantityBased: true,
  completionRule: "quantity_reached_on_final_stages",
  primaryTeam: "coffee",
  stages: [
    { key: "agreement_completed", name: "Agreement Completed", type: "status", order: 10, requiredForCompletion: false, customerVisible: true },
    { key: "committed", name: "Equipment Committed", type: "quantity", order: 20, requiredForCompletion: false, customerVisible: true },
    { key: "ordered", name: "Ordered", type: "quantity", order: 30, requiredForCompletion: false, customerVisible: true },
    { key: "shipped", name: "Shipped", type: "quantity", order: 40, requiredForCompletion: false, customerVisible: true },
    { key: "delivered", name: "Delivered", type: "quantity", order: 50, requiredForCompletion: false, customerVisible: true },
    { key: "installation_scheduled", name: "Installation Scheduled", type: "date", order: 60, requiredForCompletion: false, customerVisible: true },
    { key: "installed", name: "Installed", type: "quantity", order: 70, requiredForCompletion: true, customerVisible: true },
    { key: "activated", name: "Activated", type: "quantity", order: 80, requiredForCompletion: false, customerVisible: true },
  ],
};

// ─── Coffee recurring service ───────────────────────────────────────────
// Never auto-completes — stays active until admin explicitly transitions
// to `terminated`. Every coffee order becomes a `workflow_order_items`
// row on this workflow so admin/user can toggle each order to fulfilled.
const coffeeService: TemplateDef = {
  workflowType: "coffee_service",
  version: 1,
  title: "Coffee Service",
  description: "Recurring coffee supply service. Each order attaches as a sub-item.",
  defaultDeadlineDays: null,
  quantityBased: false,
  completionRule: "never_auto_completes",
  primaryTeam: "coffee",
  stages: [
    { key: "initial_order_placed", name: "Initial Order Placed", type: "milestone", order: 10, requiredForCompletion: false, customerVisible: true },
    { key: "recurring_active", name: "Recurring Service Active", type: "milestone", order: 20, requiredForCompletion: false, customerVisible: true },
    { key: "paused", name: "Paused", type: "milestone", order: 30, requiredForCompletion: false, customerVisible: true },
    { key: "removal_requested", name: "Equipment Removal Requested", type: "milestone", order: 40, requiredForCompletion: false, customerVisible: true },
    { key: "equipment_removed", name: "Equipment Removed", type: "milestone", order: 50, requiredForCompletion: false, customerVisible: true },
    { key: "terminated", name: "Terminated", type: "milestone", order: 60, requiredForCompletion: false, customerVisible: true },
  ],
};

// ─── Website build ──────────────────────────────────────────────────────
const websiteBuild: TemplateDef = {
  workflowType: "website_build",
  version: 1,
  title: "Website Build",
  description: "Managed website build via the Get Your Own Vending Website wizard.",
  defaultDeadlineDays: 30,
  quantityBased: false,
  completionRule: "terminal_status",
  primaryTeam: "fulfillment",
  stages: [
    { key: "submitted", name: "Submitted", type: "milestone", order: 10, requiredForCompletion: false, customerVisible: true },
    { key: "in_review", name: "In Review", type: "milestone", order: 20, requiredForCompletion: false, customerVisible: true },
    { key: "design_in_progress", name: "Design In Progress", type: "milestone", order: 30, requiredForCompletion: false, customerVisible: true },
    { key: "content_review", name: "Content Review", type: "milestone", order: 40, requiredForCompletion: false, customerVisible: true },
    { key: "staging_live", name: "Staging Live", type: "milestone", order: 50, requiredForCompletion: false, customerVisible: true },
    { key: "revisions_requested", name: "Revisions Requested", type: "milestone", order: 60, requiredForCompletion: false, customerVisible: true },
    { key: "launched", name: "Launched", type: "milestone", order: 70, requiredForCompletion: true, customerVisible: true, defaultCustomerMessage: "Your site is live!" },
  ],
};

// ─── Registry ──────────────────────────────────────────────────────────
export const WORKFLOW_TEMPLATES: readonly TemplateDef[] = [
  aiMachineFulfillment,
  locationServices,
  financing,
  coffeeEquipment,
  coffeeService,
  websiteBuild,
];

export function getTemplateDef(workflowType: WorkflowType, version = 1): TemplateDef | null {
  return (
    WORKFLOW_TEMPLATES.find(
      (t) => t.workflowType === workflowType && t.version === version,
    ) ?? null
  );
}
