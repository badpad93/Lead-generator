/**
 * Workflows — permission helpers for API routes.
 *
 * Maps sales roles to workflow permissions per the spec's permission
 * catalogue. Every write endpoint checks against these; every read
 * endpoint uses viewer scope (all / assigned / own).
 */

import { NextRequest } from "next/server";
import { supabaseAdmin } from "../supabaseAdmin";
import { getUserIdFromRequest } from "../apiAuth";
import type { WorkflowPermission } from "./types";

export interface WorkflowActor {
  id: string;
  email: string | null;
  role: string;
  scope: "all" | "assigned" | "own";
}

const ROLES_VIEW_ALL = new Set(["admin", "director_of_sales", "market_leader"]);
const ROLES_VIEW_ASSIGNED = new Set(["sales_manager", "sales"]);

// Every staff role can add internal notes and view assigned/all workflows.
const STAFF_ROLES = new Set([
  "admin",
  "director_of_sales",
  "market_leader",
  "sales_manager",
  "sales",
]);

// Roles allowed to edit stage state / assign / edit deadlines / publish
// customer updates. Individual `sales` reps can view but not edit,
// keeping accidental writes to a minimum.
const ROLES_EDIT = new Set(["admin", "director_of_sales", "market_leader", "sales_manager"]);
const ROLES_PUBLISH_CUSTOMER_UPDATES = new Set(["admin", "director_of_sales", "market_leader"]);
const ROLES_ADMIN_ONLY = new Set(["admin"]);

export async function getWorkflowActor(req: NextRequest): Promise<WorkflowActor | null> {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return null;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;

  const role = profile.role ?? "";
  const scope: "all" | "assigned" | "own" = ROLES_VIEW_ALL.has(role)
    ? "all"
    : ROLES_VIEW_ASSIGNED.has(role)
      ? "assigned"
      : "own";

  return {
    id: profile.id,
    email: profile.email ?? null,
    role,
    scope,
  };
}

export function hasPermission(actor: WorkflowActor, permission: WorkflowPermission): boolean {
  switch (permission) {
    case "workflows.view_all":
      return ROLES_VIEW_ALL.has(actor.role);
    case "workflows.view_assigned":
      return STAFF_ROLES.has(actor.role);
    case "workflows.view_own":
      return true; // any authenticated user
    case "workflows.create":
      return ROLES_ADMIN_ONLY.has(actor.role);
    case "workflows.edit_status":
    case "workflows.edit_quantity":
    case "workflows.edit_deadline":
    case "workflows.assign":
      return ROLES_EDIT.has(actor.role);
    case "workflows.add_internal_notes":
      return STAFF_ROLES.has(actor.role);
    case "workflows.publish_customer_updates":
      return ROLES_PUBLISH_CUSTOMER_UPDATES.has(actor.role);
    case "workflows.cancel":
    case "workflows.reopen":
      return ROLES_ADMIN_ONLY.has(actor.role);
    case "workflows.delete":
      return false; // never — cancellation only
    case "workflows.manage_templates":
    case "workflows.override_validation":
      return ROLES_ADMIN_ONLY.has(actor.role);
    default:
      return false;
  }
}

/**
 * Check whether a viewer is allowed to see a specific workflow row.
 * Uses assigned + primary_owner assignment as the "assigned" test.
 */
export async function canViewWorkflow(
  actor: WorkflowActor,
  workflow: { customer_id: string; assigned_user_id: string | null; id: string },
): Promise<boolean> {
  if (actor.scope === "all") return true;
  if (workflow.customer_id === actor.id) return true;
  if (actor.scope === "assigned") {
    if (workflow.assigned_user_id === actor.id) return true;
    const { data: collab } = await supabaseAdmin
      .from("workflow_assignments")
      .select("id")
      .eq("workflow_id", workflow.id)
      .eq("user_id", actor.id)
      .eq("active", true)
      .maybeSingle();
    return !!collab;
  }
  return false;
}

export function isStaff(actor: WorkflowActor): boolean {
  return STAFF_ROLES.has(actor.role);
}
