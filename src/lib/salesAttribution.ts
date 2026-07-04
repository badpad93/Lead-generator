/**
 * Sales attribution — multi-user credit per order.
 *
 * Rules:
 *   - Sum of percentages per order must equal 100 (when any row exists).
 *   - Once ANY row on an order is locked, the whole order is considered
 *     locked. Reps cannot edit; admins can override with a written reason.
 *   - Lead Owner default: if no rows exist, an implicit 100% goes to the
 *     order's assigned_rep_id / created_by (whichever is set first).
 *
 * All writes go through this module so audit + validation stay consistent.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { writeAuditLog } from "./paymentLedger";

export type LockEvent = "quote_sent" | "agreement_sent" | "order_sent" | "manual_admin_lock";

export interface AttributionRow {
  id: string;
  order_id: string;
  user_id: string;
  role_code: string;
  percentage: number;
  notes: string | null;
  locked_at: string | null;
  locked_by_event: LockEvent | null;
  is_legacy_backfill: boolean;
  created_at: string;
  updated_at: string;
}

export interface AttributionInput {
  user_id: string;
  role_code: string;
  percentage: number;
  notes?: string | null;
}

const SUM_EPSILON = 0.001;

/** Sum-to-100 check with tolerance for floating point. */
function assertSum100(rows: AttributionInput[]): void {
  const total = rows.reduce((sum, r) => sum + Number(r.percentage || 0), 0);
  if (Math.abs(total - 100) > SUM_EPSILON) {
    throw new Error(`Attribution percentages must sum to exactly 100 (got ${total.toFixed(3)}).`);
  }
}

/** Basic validation — same user can't appear twice with same role, etc. */
function validateRows(rows: AttributionInput[]): void {
  if (rows.length === 0) return; // empty means "clear and fall back to implicit lead owner"
  if (rows.length > 25) throw new Error("Too many attribution rows (max 25).");
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.user_id) throw new Error("Every attribution row needs a user_id.");
    if (!r.role_code) throw new Error("Every attribution row needs a role_code.");
    const p = Number(r.percentage);
    if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error(`Percentage must be 0-100 (got ${r.percentage}).`);
    const key = `${r.user_id}|${r.role_code}`;
    if (seen.has(key)) throw new Error(`Duplicate row: user ${r.user_id.slice(0, 8)} with role ${r.role_code}.`);
    seen.add(key);
  }
  assertSum100(rows);
}

/**
 * Load all attribution rows for an order.
 */
export async function getAttributions(orderId: string): Promise<AttributionRow[]> {
  const { data } = await supabaseAdmin
    .from("sales_attributions")
    .select("*")
    .eq("order_id", orderId)
    .order("percentage", { ascending: false });
  return (data || []) as AttributionRow[];
}

/**
 * Is any row on this order locked? A locked order can only be modified by an
 * admin override.
 */
export async function isOrderLocked(orderId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("sales_attributions")
    .select("*", { count: "exact", head: true })
    .eq("order_id", orderId)
    .not("locked_at", "is", null);
  return (count || 0) > 0;
}

/**
 * Get the "effective" attribution for an order — either the persisted rows
 * or the implicit 100% Lead Owner fallback derived from
 * sales_orders.assigned_rep_id (or created_by).
 */
export async function getEffectiveAttribution(orderId: string): Promise<AttributionRow[]> {
  const persisted = await getAttributions(orderId);
  if (persisted.length > 0) return persisted;

  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("assigned_rep_id, created_by, created_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return [];
  const userId = order.assigned_rep_id || order.created_by;
  if (!userId) return [];

  return [{
    id: `implicit-${orderId}`,
    order_id: orderId,
    user_id: userId,
    role_code: "lead_owner",
    percentage: 100,
    notes: "Implicit default — no explicit attribution set.",
    locked_at: null,
    locked_by_event: null,
    is_legacy_backfill: false,
    created_at: order.created_at || new Date().toISOString(),
    updated_at: order.created_at || new Date().toISOString(),
  }];
}

/**
 * Replace attribution rows for an order. Atomic-ish: DELETE existing rows for
 * this order + INSERT new rows in a single logical unit. Failures leave the
 * DB in a valid state (either all old rows or all new rows), but Supabase
 * doesn't expose true multi-statement transactions from the JS client —
 * callers should NOT retry on partial failure without checking state.
 *
 * If the order is locked, `authorized_as_admin` must be true and a
 * `change_reason` must be provided. Both get written to audit_logs.
 */
export interface SetAttributionsArgs {
  orderId: string;
  rows: AttributionInput[];
  actorId: string;
  authorizedAsAdmin: boolean;
  changeReason?: string | null;
}

export async function setAttributions(args: SetAttributionsArgs): Promise<AttributionRow[]> {
  validateRows(args.rows);

  const locked = await isOrderLocked(args.orderId);
  if (locked && !args.authorizedAsAdmin) {
    throw new Error("Attribution is locked. Only an admin can change it.");
  }
  if (locked && (!args.changeReason || !args.changeReason.trim())) {
    throw new Error("A change reason is required to modify locked attribution.");
  }

  // Capture the before-state for the audit trail
  const before = await getAttributions(args.orderId);

  // Wipe existing rows for this order
  await supabaseAdmin
    .from("sales_attributions")
    .delete()
    .eq("order_id", args.orderId);

  if (args.rows.length === 0) {
    // Cleared — implicit lead owner fallback re-engages.
    await writeAuditLog({
      actorId: args.actorId,
      action: locked ? "attribution_cleared_admin_override" : "attribution_cleared",
      entityType: "sales_order",
      entityId: args.orderId,
      reason: args.changeReason || null,
      before: { rows: before },
      after: { rows: [] },
    });
    return [];
  }

  const inserted: AttributionRow[] = [];
  for (const r of args.rows) {
    const { data, error } = await supabaseAdmin
      .from("sales_attributions")
      .insert({
        order_id: args.orderId,
        user_id: r.user_id,
        role_code: r.role_code,
        percentage: r.percentage,
        notes: r.notes || null,
        created_by: args.actorId,
      })
      .select("*")
      .single();
    if (error) throw error;
    inserted.push(data as AttributionRow);
  }

  await writeAuditLog({
    actorId: args.actorId,
    action: locked ? "attribution_admin_override" : (before.length > 0 ? "attribution_updated" : "attribution_set"),
    entityType: "sales_order",
    entityId: args.orderId,
    reason: args.changeReason || null,
    before: { rows: before },
    after: { rows: inserted },
  });

  return inserted;
}

/**
 * Lock every attribution row on an order — called from send routes when a
 * quote/agreement/order goes out. If no rows exist yet, seeds an implicit
 * 100% Lead Owner row before locking.
 */
export async function lockAttribution(orderId: string, event: LockEvent, actorId: string | null): Promise<void> {
  const existing = await getAttributions(orderId);
  if (existing.length === 0) {
    // Seed the implicit default before locking so the row is real
    const { data: order } = await supabaseAdmin
      .from("sales_orders")
      .select("assigned_rep_id, created_by")
      .eq("id", orderId)
      .maybeSingle();
    const userId = order?.assigned_rep_id || order?.created_by;
    if (!userId) {
      // Can't seed without a rep — silently skip; will retry on next send.
      return;
    }
    await supabaseAdmin
      .from("sales_attributions")
      .insert({
        order_id: orderId,
        user_id: userId,
        role_code: "lead_owner",
        percentage: 100,
        notes: `Auto-locked on ${event}`,
        locked_at: new Date().toISOString(),
        locked_by_event: event,
        created_by: actorId,
        is_legacy_backfill: false,
      });
  } else if (existing.some((r) => !r.locked_at)) {
    // Lock in place — no data changes, just stamp the lock fields.
    await supabaseAdmin
      .from("sales_attributions")
      .update({
        locked_at: new Date().toISOString(),
        locked_by_event: event,
      })
      .eq("order_id", orderId)
      .is("locked_at", null);
  }

  await writeAuditLog({
    actorId,
    action: "attribution_locked",
    entityType: "sales_order",
    entityId: orderId,
    metadata: { event },
  });
}

/**
 * Backfill: for every sales_orders row that has no attribution rows yet,
 * seed a 100% Lead Owner row from assigned_rep_id / created_by. Marked as
 * legacy so future admin views can distinguish "we filled this in" from
 * "someone set this deliberately".
 */
export async function backfillAttributions(opts: { limit?: number; sinceDays?: number }): Promise<{
  scanned: number;
  seeded: number;
  skipped_no_rep: number;
  skipped_existing: number;
  errors: string[];
}> {
  const summary = { scanned: 0, seeded: 0, skipped_no_rep: 0, skipped_existing: 0, errors: [] as string[] };
  const limit = Math.min(1000, Math.max(1, opts.limit ?? 500));
  const cutoff = new Date(Date.now() - (opts.sinceDays ?? 3650) * 24 * 60 * 60 * 1000).toISOString();

  const { data: orders } = await supabaseAdmin
    .from("sales_orders")
    .select("id, assigned_rep_id, created_by")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const o of orders || []) {
    summary.scanned++;

    const { count } = await supabaseAdmin
      .from("sales_attributions")
      .select("*", { count: "exact", head: true })
      .eq("order_id", o.id);
    if ((count || 0) > 0) { summary.skipped_existing++; continue; }

    const userId = o.assigned_rep_id || o.created_by;
    if (!userId) { summary.skipped_no_rep++; continue; }

    try {
      await supabaseAdmin.from("sales_attributions").insert({
        order_id: o.id,
        user_id: userId,
        role_code: "lead_owner",
        percentage: 100,
        notes: "Legacy backfill — implicit 100% to assigned_rep_id.",
        is_legacy_backfill: true,
      });
      summary.seeded++;
    } catch (e) {
      summary.errors.push(`${o.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}
