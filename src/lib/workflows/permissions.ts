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

// Only admins may view every workflow across the org. Every other
// staff role — including director_of_sales, market_leader, and
// sales_manager — is scoped to workflows they are personally assigned
// to (primary_owner or active collaborator via workflow_assignments).
// Managers who need visibility across their reports get it by being
// added as a collaborator on those workflows.
const ROLES_VIEW_ALL = new Set(["admin"]);

// Staff roles — the population that can act inside the CRM at all.
// This is unchanged; visibility scoping happens separately below.
const STAFF_ROLES = new Set([
  "admin",
  "director_of_sales",
  "market_leader",
  "sales_manager",
  "sales",
]);

// Roles allowed to edit stage state / assign / edit deadlines / publish
// customer updates unconditionally (no assignment check needed). Sales
// reps get equivalent edit rights on workflows they're ASSIGNED to via
// the canOperationallyEditWorkflow() helper below.
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
  // admin → "all"; every other staff role → "assigned" (own +
  // collaborator); anyone else (customer, PP, manufacturer_partner)
  // → "own" (only workflows where they ARE the customer).
  const scope: "all" | "assigned" | "own" = ROLES_VIEW_ALL.has(role)
    ? "all"
    : STAFF_ROLES.has(role)
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
      // Widened from admin-only so DOS and market_leader can spin up a
      // workflow for a customer without asking admin every time.
      // sales_manager + sales still route through their manager.
      return ROLES_PUBLISH_CUSTOMER_UPDATES.has(actor.role);
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
      // Admin-only hard delete. Cancellation remains the default path;
      // delete exists for cleaning up test/duplicate workflows the CRM
      // shouldn't carry forever. Every deletion writes an audit_logs
      // row before the cascade fires.
      return ROLES_ADMIN_ONLY.has(actor.role);
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

/**
 * Check whether a staff actor is currently assigned to a workflow —
 * either as primary owner or as an active collaborator. Used by the
 * "sales rep can edit the workflows on their plate" path.
 */
export async function isAssignedToWorkflow(
  actorId: string,
  workflow: { id: string; assigned_user_id: string | null },
): Promise<boolean> {
  if (workflow.assigned_user_id === actorId) return true;
  const { data } = await supabaseAdmin
    .from("workflow_assignments")
    .select("id")
    .eq("workflow_id", workflow.id)
    .eq("user_id", actorId)
    .eq("active", true)
    .maybeSingle();
  return !!data;
}

/**
 * The single gate for "day-to-day" workflow edits — stage status,
 * completed quantity, stage rename, deadline nudge, internal notes.
 * Returns true when the actor has an unconditional edit role (admin
 * / DOS / market_leader / sales_manager) OR is assigned to this
 * specific workflow. Elevated actions (cancel / reopen / delete /
 * publish customer updates / payment override) stay strictly
 * role-based via hasPermission.
 */
export async function canOperationallyEditWorkflow(
  actor: WorkflowActor,
  workflow: { id: string; assigned_user_id: string | null },
): Promise<boolean> {
  if (ROLES_EDIT.has(actor.role)) return true;
  if (!isStaff(actor)) return false;
  return isAssignedToWorkflow(actor.id, workflow);
}
