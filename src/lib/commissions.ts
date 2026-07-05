/**
 * Commissions — resolve rate, earn on payment, reverse on refund.
 *
 * Rate resolution (most specific first):
 *   1. user_id + category   (priority 1110)
 *   2. user_id              (priority 1100)
 *   3. role_code + category (priority 110)
 *   4. role_code            (priority 100)
 *   5. is_default = true    (priority 0)
 *
 * Earn: for each active attribution row on an order, we compute
 *     basis  = payment.amount × attribution_percentage / 100
 *     amount = basis × rate_bps / 10000
 * and write a `commission_ledger` row per (user, order, payment, role).
 *
 * Reverse: when a payment is refunded or charged back, we walk the ledger
 * rows for that payment and write matching negative-amount rows referencing
 * `reversed_of_id`. The refund amount is applied pro-rata across rows if the
 * refund is partial.
 *
 * All writes are idempotent per (order_id, payment_id, user_id, role_code)
 * for earns, and per (reversed_of_id, refund payment_id) for reversals.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { writeAuditLog } from "./paymentLedger";
import { getEffectiveAttribution } from "./salesAttribution";

export type CommissionStatus =
  | "pending"
  | "held"
  | "earned"
  | "reversed"
  | "paid"
  | "cancelled"
  | "clawback_pending"
  | "clawback_collected"
  | "clawback_waived";

export interface CommissionRule {
  id: string;
  user_id: string | null;
  role_code: string | null;
  category: string | null;
  rate_bps: number;
  hold_days: number;
  priority: number;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionLedgerRow {
  id: string;
  user_id: string;
  order_id: string;
  attribution_id: string | null;
  role_code: string;
  payment_id: string | null;
  rule_id: string | null;
  attribution_percentage: number;
  basis_cents: number;
  rate_bps: number;
  amount_cents: number;
  hold_days: number;
  status: CommissionStatus;
  earned_at: string;
  clearable_at: string | null;
  paid_at: string | null;
  reversed_of_id: string | null;
  reversal_reason: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

// ─── Rate resolver ──────────────────────────────────────────────────────

export interface ResolveRateArgs {
  userId: string;
  roleCode: string;
  category?: string | null;
}

/**
 * Find the most-specific active rule for (user, role, category). Falls back
 * to the seeded default rule (rate 500 bps = 5%, no hold) if nothing matches.
 * Returns null only if the default rule is missing entirely (should never
 * happen once migration 109 has run).
 */
export async function resolveCommissionRule(args: ResolveRateArgs): Promise<CommissionRule | null> {
  const category = args.category ? args.category.toLowerCase() : null;

  // Pull the small superset of possibly-matching rules, rank in JS.
  const { data: rules } = await supabaseAdmin
    .from("commission_rules")
    .select("*")
    .eq("is_active", true)
    .or(`user_id.eq.${args.userId},user_id.is.null`);

  const candidates = (rules || []) as CommissionRule[];

  // Score each candidate by specificity; skip any that don't match.
  let best: CommissionRule | null = null;
  let bestPriority = -1;
  for (const r of candidates) {
    if (r.user_id && r.user_id !== args.userId) continue;
    if (r.role_code && r.role_code !== args.roleCode) continue;
    if (r.category && r.category.toLowerCase() !== category) continue;
    // priority already computed on write, but recompute to be safe if the
    // trigger/db value was stale.
    const p =
      (r.user_id ? 1000 : 0) +
      (r.role_code ? 100 : 0) +
      (r.category ? 10 : 0);
    if (p > bestPriority) {
      bestPriority = p;
      best = r;
    }
  }
  if (best) return best;

  const { data: fallback } = await supabaseAdmin
    .from("commission_rules")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return (fallback as CommissionRule) || null;
}

// ─── Earn ───────────────────────────────────────────────────────────────

export interface EarnArgs {
  orderId: string;
  paymentId: string;
  paymentAmountCents: number;    // positive
  actorId?: string | null;       // system when auto-earned via webhook
}

export interface EarnResult {
  wrote: number;
  skipped: number;
  reason?: string;
  rows: CommissionLedgerRow[];
}

/**
 * For each attribution row on the order, compute + write a ledger entry
 * against the given payment.
 *
 * Rate resolution (most-specific first):
 *   1. order_items.commission_rate_bps_override  — per-line
 *   2. sales_orders.commission_rate_bps_override — per-order
 *   3. commission_rules chain (user+category > user > role+category > role)
 *   4. commission_rules where is_default=true
 *
 * When ANY line on the order has a per-line override, we split the earn per
 * line: `basis = payment × (line.total / order.total) × attribution %` and
 * emit one ledger row per (attribution × line). Otherwise (or when the order
 * has an order-level override or falls back to rule chain) we emit one row
 * per attribution against the whole payment.
 *
 * Idempotency keys:
 *   - Whole-order path: (order_id, payment_id, user_id, role_code)
 *   - Per-line path:    (order_id, payment_id, user_id, role_code, order_item_id)
 */
export async function earnCommissionsForPayment(args: EarnArgs): Promise<EarnResult> {
  if (!(args.paymentAmountCents > 0)) return { wrote: 0, skipped: 0, reason: "non_positive_amount", rows: [] };

  // Load order for category + override context
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_type, commission_rate_bps_override, total_value")
    .eq("id", args.orderId)
    .maybeSingle();
  if (!order) return { wrote: 0, skipped: 0, reason: "order_not_found", rows: [] };

  const category = (order.order_type || null) as string | null;
  const orderOverrideBps: number | null = typeof order.commission_rate_bps_override === "number"
    ? order.commission_rate_bps_override
    : null;

  const attributions = await getEffectiveAttribution(args.orderId);
  if (attributions.length === 0) return { wrote: 0, skipped: 0, reason: "no_attribution", rows: [] };

  // Pull all lines. If any has a per-line override, we switch to line-split
  // mode. We ALWAYS load them because we need line totals for per-line math.
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select("id, total_price, commission_rate_bps_override")
    .eq("order_id", args.orderId);
  const lines = items || [];
  const hasLineOverride = lines.some((l) => typeof l.commission_rate_bps_override === "number");
  const linesTotal = lines.reduce((s, l) => s + Number(l.total_price || 0), 0);
  const orderTotalDollars = Number(order.total_value || 0) || linesTotal;

  const wrote: CommissionLedgerRow[] = [];
  let skipped = 0;

  if (hasLineOverride && linesTotal > 0) {
    // Per-line path — emit (attribution × line) ledger rows.
    const { data: existing } = await supabaseAdmin
      .from("commission_ledger")
      .select("id, user_id, role_code, order_item_id")
      .eq("order_id", args.orderId)
      .eq("payment_id", args.paymentId);
    const existingKey = new Set(
      (existing || []).map((r) => `${r.user_id}|${r.role_code}|${r.order_item_id || ""}`),
    );

    for (const attr of attributions) {
      // Fall back to the rule chain if a specific line has no override.
      const fallbackRule = await resolveCommissionRule({
        userId: attr.user_id,
        roleCode: attr.role_code,
        category,
      });

      for (const line of lines) {
        const linePriceDollars = Number(line.total_price || 0);
        if (linePriceDollars <= 0) continue;

        const key = `${attr.user_id}|${attr.role_code}|${line.id}`;
        if (existingKey.has(key)) { skipped++; continue; }

        // Line share of payment, then attribution share.
        const lineShare = linePriceDollars / linesTotal;
        const basisCents = Math.round(args.paymentAmountCents * lineShare * (Number(attr.percentage) / 100));

        // Rate resolution: per-line override > order override > rule > skip
        const rateBps =
          typeof line.commission_rate_bps_override === "number"
            ? line.commission_rate_bps_override
            : (orderOverrideBps ?? fallbackRule?.rate_bps ?? null);
        if (rateBps == null) { skipped++; continue; }

        const holdDays = fallbackRule?.hold_days ?? 0;
        const amountCents = Math.round((basisCents * rateBps) / 10000);
        if (amountCents === 0) { skipped++; continue; }

        const holdMs = holdDays * 24 * 60 * 60 * 1000;
        const earnedAtIso = new Date().toISOString();
        const clearableAtIso = new Date(Date.now() + holdMs).toISOString();
        const status: CommissionStatus = holdDays > 0 ? "held" : "earned";
        const attributionRowId = attr.id.startsWith("implicit-") ? null : attr.id;

        const { data: inserted, error } = await supabaseAdmin
          .from("commission_ledger")
          .insert({
            user_id: attr.user_id,
            order_id: args.orderId,
            order_item_id: line.id,
            attribution_id: attributionRowId,
            role_code: attr.role_code,
            payment_id: args.paymentId,
            rule_id: fallbackRule?.id || null,
            attribution_percentage: attr.percentage,
            basis_cents: basisCents,
            rate_bps: rateBps,
            amount_cents: amountCents,
            hold_days: holdDays,
            status,
            earned_at: earnedAtIso,
            clearable_at: clearableAtIso,
            notes: typeof line.commission_rate_bps_override === "number"
              ? "Line-level override"
              : (orderOverrideBps != null ? "Order-level override" : (attr.is_legacy_backfill ? "Legacy backfill attribution" : null)),
            created_by: args.actorId || null,
          })
          .select("*")
          .single();
        if (error) throw error;
        wrote.push(inserted as CommissionLedgerRow);
      }
    }
  } else {
    // Whole-order path — one row per attribution.
    const { data: existing } = await supabaseAdmin
      .from("commission_ledger")
      .select("id, user_id, role_code, order_item_id")
      .eq("order_id", args.orderId)
      .eq("payment_id", args.paymentId)
      .is("order_item_id", null);
    const existingKey = new Set((existing || []).map((r) => `${r.user_id}|${r.role_code}`));

    for (const attr of attributions) {
      const key = `${attr.user_id}|${attr.role_code}`;
      if (existingKey.has(key)) { skipped++; continue; }

      const rule = await resolveCommissionRule({
        userId: attr.user_id,
        roleCode: attr.role_code,
        category,
      });
      // Order-level override wins over rule chain if set.
      const rateBps = orderOverrideBps ?? rule?.rate_bps ?? null;
      if (rateBps == null) { skipped++; continue; }

      const holdDays = rule?.hold_days ?? 0;
      const basisCents = Math.round(args.paymentAmountCents * (Number(attr.percentage) / 100));
      const amountCents = Math.round((basisCents * rateBps) / 10000);
      if (amountCents === 0) { skipped++; continue; }

      const holdMs = holdDays * 24 * 60 * 60 * 1000;
      const earnedAtIso = new Date().toISOString();
      const clearableAtIso = new Date(Date.now() + holdMs).toISOString();
      const status: CommissionStatus = holdDays > 0 ? "held" : "earned";
      const attributionRowId = attr.id.startsWith("implicit-") ? null : attr.id;

      const { data: inserted, error } = await supabaseAdmin
        .from("commission_ledger")
        .insert({
          user_id: attr.user_id,
          order_id: args.orderId,
          attribution_id: attributionRowId,
          role_code: attr.role_code,
          payment_id: args.paymentId,
          rule_id: rule?.id || null,
          attribution_percentage: attr.percentage,
          basis_cents: basisCents,
          rate_bps: rateBps,
          amount_cents: amountCents,
          hold_days: holdDays,
          status,
          earned_at: earnedAtIso,
          clearable_at: clearableAtIso,
          notes: orderOverrideBps != null
            ? "Order-level override"
            : (attr.is_legacy_backfill ? "Legacy backfill attribution" : null),
          created_by: args.actorId || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      wrote.push(inserted as CommissionLedgerRow);
    }
  }

  if (wrote.length > 0) {
    await writeAuditLog({
      actorId: args.actorId || null,
      action: "commissions_earned",
      entityType: "sales_order",
      entityId: args.orderId,
      metadata: {
        payment_id: args.paymentId,
        payment_amount_cents: args.paymentAmountCents,
        rows: wrote.length,
        line_split: hasLineOverride,
        order_override_bps: orderOverrideBps,
      },
    });
  }
  // Reference so lint doesn't flag orderTotalDollars if unused (kept for future audit)
  void orderTotalDollars;
  return { wrote: wrote.length, skipped, rows: wrote };
}

// ─── Reverse ────────────────────────────────────────────────────────────

export interface ReverseArgs {
  parentPaymentId: string;          // the ORIGINAL payment; NOT the refund row
  refundPaymentId: string;          // the negative-amount refund row
  refundAmountCents: number;        // positive input (magnitude of refund)
  reason?: string | null;
  isChargeback?: boolean;
  actorId?: string | null;
}

export interface ReverseResult {
  wrote: number;
  skipped: number;
  reason?: string;
  rows: CommissionLedgerRow[];
}

/**
 * Walk earn rows tied to the parent payment and write pro-rata reversals.
 * Idempotent per (reversed_of_id, refund payment_id) — a re-fire will find
 * the reversal row already exists and skip.
 */
export async function reverseCommissionsForRefund(args: ReverseArgs): Promise<ReverseResult> {
  if (!(args.refundAmountCents > 0)) return { wrote: 0, skipped: 0, reason: "non_positive_amount", rows: [] };

  // Find original payment amount so we can compute the refund ratio.
  const { data: parent } = await supabaseAdmin
    .from("payments")
    .select("id, amount_cents")
    .eq("id", args.parentPaymentId)
    .maybeSingle();
  if (!parent) return { wrote: 0, skipped: 0, reason: "parent_not_found", rows: [] };
  const parentMagnitude = Math.abs(Number(parent.amount_cents || 0));
  if (parentMagnitude === 0) return { wrote: 0, skipped: 0, reason: "zero_parent", rows: [] };

  const refundRatio = Math.min(1, args.refundAmountCents / parentMagnitude);

  const { data: earns } = await supabaseAdmin
    .from("commission_ledger")
    .select("*")
    .eq("payment_id", args.parentPaymentId)
    .gt("amount_cents", 0)
    .in("status", ["held", "earned", "paid"]);

  const earnRows = (earns || []) as CommissionLedgerRow[];
  if (earnRows.length === 0) return { wrote: 0, skipped: 0, reason: "no_earn_rows", rows: [] };

  // Existing reversals for this refund
  const { data: existingReversals } = await supabaseAdmin
    .from("commission_ledger")
    .select("id, reversed_of_id")
    .eq("payment_id", args.refundPaymentId)
    .lt("amount_cents", 0);
  const alreadyReversed = new Set((existingReversals || []).map((r) => r.reversed_of_id).filter(Boolean));

  const wrote: CommissionLedgerRow[] = [];
  let skipped = 0;

  for (const earn of earnRows) {
    if (alreadyReversed.has(earn.id)) { skipped++; continue; }

    const reverseAmount = -Math.round(Number(earn.amount_cents) * refundRatio);
    const reverseBasis = -Math.round(Number(earn.basis_cents) * refundRatio);
    if (reverseAmount === 0) { skipped++; continue; }

    // Branch on the earn's current status:
    //   paid  → money already went out → clawback_pending (admin must
    //           collect or waive)
    //   held/earned → money hasn't gone out → 'reversed' (clean write-off)
    const wasPaid = earn.status === "paid";
    const reversalStatus: CommissionStatus = wasPaid ? "clawback_pending" : "reversed";
    const reversalNote = args.isChargeback
      ? (wasPaid ? "Clawback (chargeback) — commission already paid out" : "Auto-reversal (chargeback)")
      : (wasPaid ? "Clawback (refund) — commission already paid out" : "Auto-reversal (refund)");

    const { data: inserted, error } = await supabaseAdmin
      .from("commission_ledger")
      .insert({
        user_id: earn.user_id,
        order_id: earn.order_id,
        attribution_id: earn.attribution_id,
        role_code: earn.role_code,
        payment_id: args.refundPaymentId,
        rule_id: earn.rule_id,
        attribution_percentage: earn.attribution_percentage,
        basis_cents: reverseBasis,
        rate_bps: earn.rate_bps,
        amount_cents: reverseAmount,
        hold_days: 0,
        status: reversalStatus,
        earned_at: new Date().toISOString(),
        clearable_at: new Date().toISOString(),
        reversed_of_id: earn.id,
        reversal_reason: args.reason || (args.isChargeback ? "chargeback" : "refund"),
        notes: reversalNote,
        created_by: args.actorId || null,
      })
      .select("*")
      .single();
    if (error) throw error;
    wrote.push(inserted as CommissionLedgerRow);

    // If the earn was still earned/held (money hadn't gone out) and the
    // reversal fully covers it, flip the original to 'reversed' so summary
    // math treats it as a clean write-off. NEVER rewrite a paid row — the
    // payment history stays intact; the clawback row is the paper trail.
    if (!wasPaid && Math.abs(reverseAmount) >= Number(earn.amount_cents)) {
      await supabaseAdmin
        .from("commission_ledger")
        .update({ status: "reversed" })
        .eq("id", earn.id);
    }
  }

  if (wrote.length > 0) {
    await writeAuditLog({
      actorId: args.actorId || null,
      action: args.isChargeback ? "commissions_reversed_chargeback" : "commissions_reversed_refund",
      entityType: "payment",
      entityId: args.refundPaymentId,
      reason: args.reason || null,
      metadata: {
        parent_payment_id: args.parentPaymentId,
        refund_amount_cents: args.refundAmountCents,
        rows: wrote.length,
      },
    });
  }

  return { wrote: wrote.length, skipped, rows: wrote };
}

// ─── Clawback settlement ────────────────────────────────────────────────

export interface SettleClawbackArgs {
  ids: string[];
  outcome: "collected" | "waived";
  actorId: string;
  note?: string | null;
}

export interface SettleClawbackResult {
  settled: number;
  skipped: number;
  total_cents: number;
}

/**
 * Admin action — resolve outstanding clawbacks.
 *   collected → money recovered from the rep (payroll deduction, invoice, etc.)
 *   waived    → company writes off the loss
 * Only rows currently in `clawback_pending` are affected. Idempotent.
 */
export async function settleClawbacks(args: SettleClawbackArgs): Promise<SettleClawbackResult> {
  if (args.ids.length === 0) return { settled: 0, skipped: 0, total_cents: 0 };

  const { data: rows } = await supabaseAdmin
    .from("commission_ledger")
    .select("id, status, amount_cents, user_id")
    .in("id", args.ids);

  const eligible = (rows || []).filter((r) => r.status === "clawback_pending");
  const skipped = (rows || []).length - eligible.length;
  if (eligible.length === 0) return { settled: 0, skipped, total_cents: 0 };

  const newStatus = args.outcome === "collected" ? "clawback_collected" : "clawback_waived";
  const nowIso = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("commission_ledger")
    .update({
      status: newStatus,
      clawback_settled_at: nowIso,
      clawback_settled_by: args.actorId,
      clawback_settlement_note: args.note || null,
    })
    .in("id", eligible.map((r) => r.id));
  if (error) throw error;

  const totalCents = eligible.reduce((s, r) => s + Math.abs(Number(r.amount_cents || 0)), 0);

  await writeAuditLog({
    actorId: args.actorId,
    action: args.outcome === "collected" ? "clawback_collected" : "clawback_waived",
    entityType: "commission_ledger",
    reason: args.note || null,
    metadata: { ids: eligible.map((r) => r.id), total_cents: totalCents },
  });

  return { settled: eligible.length, skipped, total_cents: totalCents };
}

// ─── Backfill ───────────────────────────────────────────────────────────

export interface BackfillArgs {
  limit?: number;
  sinceDays?: number;
  actorId?: string | null;
}

export interface BackfillSummary {
  scanned: number;
  earned: number;
  skipped_existing: number;
  skipped_no_payment: number;
  skipped_other: number;
  errors: string[];
}

/**
 * Walk paid payments in the window whose linked orders lack commission ledger
 * rows, and run earn logic. Reversal backfill is intentionally NOT here —
 * refund/chargeback events since Phase 2 have already run through the ledger,
 * so any earn we produce now for an already-refunded payment is what we want
 * (attribution existed at time of refund only implicitly).
 */
export async function backfillCommissions(args: BackfillArgs): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    scanned: 0,
    earned: 0,
    skipped_existing: 0,
    skipped_no_payment: 0,
    skipped_other: 0,
    errors: [],
  };
  const limit = Math.min(2000, Math.max(1, args.limit ?? 500));
  const cutoff = new Date(Date.now() - (args.sinceDays ?? 365) * 24 * 60 * 60 * 1000).toISOString();

  const { data: payments } = await supabaseAdmin
    .from("payments")
    .select("id, order_id, amount_cents, status, paid_at, created_at")
    .eq("status", "paid")
    .not("order_id", "is", null)
    .gte("paid_at", cutoff)
    .order("paid_at", { ascending: false })
    .limit(limit);

  for (const p of payments || []) {
    summary.scanned++;
    if (!p.order_id) { summary.skipped_no_payment++; continue; }
    if (!(Number(p.amount_cents) > 0)) { summary.skipped_other++; continue; }

    try {
      const result = await earnCommissionsForPayment({
        orderId: p.order_id,
        paymentId: p.id,
        paymentAmountCents: Number(p.amount_cents),
        actorId: args.actorId || null,
      });
      if (result.wrote > 0) summary.earned++;
      else summary.skipped_existing++;
    } catch (e) {
      summary.errors.push(`${p.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}

// ─── Summary helpers ────────────────────────────────────────────────────

export interface CommissionSummary {
  earned_cents: number;
  held_cents: number;
  reversed_cents: number;
  paid_cents: number;
  pending_clearable_cents: number;
  net_available_cents: number;
  clawback_pending_cents: number;
  clawback_collected_cents: number;
  clawback_waived_cents: number;
  by_role: Record<string, number>;
  row_count: number;
}

export async function summarizeCommissionsForUser(userId: string, sinceDays = 365): Promise<CommissionSummary> {
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabaseAdmin
    .from("commission_ledger")
    .select("amount_cents, status, role_code, clearable_at")
    .eq("user_id", userId)
    .gte("earned_at", cutoff);

  const summary: CommissionSummary = {
    earned_cents: 0,
    held_cents: 0,
    reversed_cents: 0,
    paid_cents: 0,
    pending_clearable_cents: 0,
    net_available_cents: 0,
    clawback_pending_cents: 0,
    clawback_collected_cents: 0,
    clawback_waived_cents: 0,
    by_role: {},
    row_count: (rows || []).length,
  };
  const now = Date.now();

  for (const r of rows || []) {
    const amt = Number(r.amount_cents) || 0;
    const mag = Math.abs(amt);
    if (r.status === "reversed") { summary.reversed_cents += mag; continue; }
    if (r.status === "clawback_pending") { summary.clawback_pending_cents += mag; continue; }
    if (r.status === "clawback_collected") { summary.clawback_collected_cents += mag; continue; }
    if (r.status === "clawback_waived") { summary.clawback_waived_cents += mag; continue; }
    if (amt < 0) { summary.reversed_cents += mag; continue; }
    summary.by_role[r.role_code] = (summary.by_role[r.role_code] || 0) + amt;
    if (r.status === "paid") summary.paid_cents += amt;
    else if (r.status === "held") {
      summary.held_cents += amt;
      if (r.clearable_at && new Date(r.clearable_at).getTime() <= now) {
        summary.pending_clearable_cents += amt;
      }
    } else if (r.status === "earned") {
      summary.earned_cents += amt;
    }
  }

  // Net available = earned + clearable held − reversed − outstanding clawbacks
  // (owed back but not yet settled).
  summary.net_available_cents = summary.earned_cents
    + summary.pending_clearable_cents
    - summary.reversed_cents
    - summary.clawback_pending_cents;
  if (summary.net_available_cents < 0) summary.net_available_cents = 0;
  return summary;
}
