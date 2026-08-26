import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Round-robin-by-workload sales-rep picker.
 *
 * Used by intake surfaces (/api/request-location today, others
 * later) that need to auto-assign an incoming lead/order to a rep
 * when the customer didn't come in through a specific referral.
 *
 * Selection rules
 *   1. Pull every eligible active rep (role in {sales, sales_manager}).
 *   2. For each rep, count their open workflows — the same "open"
 *      definition the /sales/workload dashboard uses so this stays
 *      in sync with the capacity view.
 *   3. Pick the rep with the minimum count.
 *   4. On a tie, exclude the most-recently-assigned rep for the
 *      given order_type (from sales_orders history) so the queue
 *      doesn't hammer the same rep back-to-back. If the last-
 *      assigned rep is the ONLY tied option, they get the assignment
 *      anyway — better than leaving it unassigned.
 *
 * Returns the picked rep's profile id, or null when no eligible
 * reps exist (caller should leave the row unassigned in that case).
 */

const ELIGIBLE_ROLES = ["sales", "sales_manager"] as const;

// Workflows in these states are terminal — not part of the rep's
// active load. Kept in sync with src/app/api/sales/workload/route.ts.
const TERMINAL_WORKFLOW_STATUSES = [
  "completed",
  "cancelled",
  "refunded",
  "expired",
];

export interface AutoAssignOptions {
  /** Order type used to look up the "last assigned" tiebreaker. */
  orderType: string;
}

export interface AutoAssignResult {
  userId: string;
  fullName: string | null;
  email: string | null;
  openWorkflows: number;
  reason: string;
}

export async function pickLeastLoadedSalesRep(
  opts: AutoAssignOptions,
): Promise<AutoAssignResult | null> {
  // Pull eligible reps.
  const { data: reps, error: repsErr } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ELIGIBLE_ROLES as unknown as string[]);
  if (repsErr || !reps || reps.length === 0) return null;

  // Fan out one workflow-count query per rep. Load is dozens at
  // most; Promise.all here is cheaper than a group-by round-trip.
  const counts = await Promise.all(
    reps.map(async (rep) => {
      const { count } = await supabaseAdmin
        .from("workflows")
        .select("id", { count: "exact", head: true })
        .eq("assigned_user_id", rep.id)
        .not(
          "overall_status",
          "in",
          `(${TERMINAL_WORKFLOW_STATUSES.map((s) => `"${s}"`).join(",")})`,
        );
      return { rep, count: count ?? 0 };
    }),
  );

  // Sort ASC by count so the lightest floats to the top.
  counts.sort((a, b) => a.count - b.count);
  const minCount = counts[0].count;
  const tied = counts.filter((c) => c.count === minCount);

  let pick = tied[0];
  let reason = `lightest workload (${minCount} open workflow${minCount === 1 ? "" : "s"})`;

  if (tied.length > 1) {
    // Look up the last-assigned rep for this order_type and exclude
    // them from the tie-break if there's any other tied option.
    const { data: lastOrder } = await supabaseAdmin
      .from("sales_orders")
      .select("assigned_rep_id")
      .eq("order_type", opts.orderType)
      .not("assigned_rep_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAssignedId = lastOrder?.assigned_rep_id ?? null;

    if (lastAssignedId) {
      const notLast = tied.filter((c) => c.rep.id !== lastAssignedId);
      if (notLast.length > 0) {
        // Any of the non-last-assigned tied reps is fair. Pick the
        // first for determinism (list is sorted by rep id via the
        // profiles fetch's default order, so the choice is stable
        // across identical inputs — good for auditability).
        pick = notLast[0];
        reason = `${minCount} open workflow${minCount === 1 ? "" : "s"} tie; skipped last-assigned rep`;
      } else {
        // Only the last-assigned rep is tied. They get it anyway.
        reason = `${minCount} open workflow${minCount === 1 ? "" : "s"} tie; last-assigned was the only tied option`;
      }
    }
  }

  return {
    userId: pick.rep.id,
    fullName: (pick.rep as { full_name: string | null }).full_name ?? null,
    email: (pick.rep as { email: string | null }).email ?? null,
    openWorkflows: pick.count,
    reason,
  };
}
