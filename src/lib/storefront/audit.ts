/**
 * Storefront audit event writer.
 *
 * Every tenant-scoped mutation that matters — tenant approve /
 * suspend, customer transfer, price change, commission adjustment,
 * payout release, admin impersonation, etc. — writes one row into
 * storefront_audit_events through this helper so the admin console
 * can render a truthful "who changed what, when, why" timeline.
 *
 * The DB table has no INSERT policy (only service role writes), so
 * this module intentionally goes through supabaseAdmin. Callers are
 * responsible for having already authorized the underlying action;
 * recording an audit event does not itself grant access.
 *
 * We never throw out of recordAuditEvent — an audit-log failure must
 * NOT roll back the primary business write. The insert failure is
 * logged to console and the primary caller returns success.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type StorefrontAuditAction =
  | "tenant.created"
  | "tenant.approved"
  | "tenant.suspended"
  | "tenant.closed"
  | "tenant.branding_updated"
  | "tenant.tier_assigned"
  | "tenant.contact_updated"
  | "tenant.tax_updated"
  | "tenant.owner_reassigned"
  | "customer.invited"
  | "customer.invitation_revoked"
  | "customer.invitation_resent"
  | "customer.enrolled"
  | "customer.transferred"
  | "customer.suspended"
  | "customer.deleted"
  | "pricing.tenant_updated"
  | "pricing.tenant_deleted"
  | "pricing.customer_updated"
  | "pricing.customer_deleted"
  | "commission.recorded"
  | "commission.settled"
  | "commission.reversed"
  | "commission.adjusted"
  | "commission.hold_applied"
  | "commission.hold_released"
  | "payout.scheduled"
  | "payout.sent"
  | "payout.failed"
  | "admin.impersonated"
  | "admin.override";

export interface RecordAuditEventInput {
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  action: StorefrontAuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  correlationId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditEvent(input: RecordAuditEventInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("storefront_audit_events").insert({
      tenant_id: input.tenantId ?? null,
      actor_id: input.actorId ?? null,
      actor_role: input.actorRole ?? null,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      correlation_id: input.correlationId ?? null,
      ip_address: input.ipAddress ?? null,
      user_agent: input.userAgent ?? null,
    });
    if (error) {
      console.error("[storefront.audit] insert failed", {
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId,
        error: error.message,
      });
    }
  } catch (err) {
    console.error("[storefront.audit] insert threw", {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Diff helper for before/after JSON — returns an object containing
 * only the keys whose value actually changed. Keeps audit rows small
 * and readable in the admin console instead of dumping the whole
 * entity twice on every write.
 */
export function diff<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  if (!before && !after) return { before: b, after: a };
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  for (const key of keys) {
    const bv = (before as Record<string, unknown> | null | undefined)?.[key];
    const av = (after as Record<string, unknown> | null | undefined)?.[key];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      (b as Record<string, unknown>)[key] = bv;
      (a as Record<string, unknown>)[key] = av;
    }
  }
  return { before: b, after: a };
}
