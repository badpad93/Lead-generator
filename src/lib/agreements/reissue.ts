/**
 * Safe agreement reissue / supersession.
 *
 * Replaces an already-sent-or-viewed BUT UNSIGNED purchase agreement with a
 * freshly-generated one for the SAME order, without ever mutating the old
 * document in place:
 *
 *   1. the old agreement is marked `cancelled` (status only — its snapshot,
 *      sent_at/viewed_at, sign_token and any signatures are preserved), so
 *      the existing sign-page/status guards refuse any further initials or
 *      signatures on it (see agreements/sign/[token]/*);
 *   2. upsertAgreementForOrder then inserts a brand-new DRAFT agreement from
 *      the current canonical order snapshot — new UUID, new sign_token
 *      (DB default gen_random_uuid), corrected template — because
 *      findLiveAgreement excludes cancelled rows.
 *
 * The replacement is NOT sent. It starts as `draft` for human review; the
 * normal send flow mails it afterward. No invoice is created; invoice_status,
 * payment_status, total_value and any existing invoice (e.g. Invoice 779) are
 * preserved. The order's DERIVED state IS corrected, though: it no longer
 * claims a signature is pending on the cancelled agreement (see
 * resetOrderStateForReplacement). And when the order is already invoiced, the
 * replacement is created with auto_send_invoice_on_signing=false so signing it
 * won't request a second invoice (the signing-time idempotency guard is kept
 * as defense in depth).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertAgreementForOrder } from "@/lib/agreements/sync";
import { canSupersede } from "@/lib/agreements/supersedeGuard";
import { invoiceAlreadyExists } from "@/lib/invoiceIdempotency";

export { canSupersede, SUPERSEDABLE_STATUSES } from "@/lib/agreements/supersedeGuard";

async function logAgreementActivity(
  agreementId: string,
  userId: string,
  activityType: string,
  description: string,
): Promise<void> {
  try {
    await supabaseAdmin.from("agreement_activity_log").insert({
      agreement_id: agreementId,
      user_id: userId,
      activity_type: activityType,
      description,
    });
  } catch (e) {
    console.error("[agreements/reissue] activity log failed (non-fatal):", e);
  }
}

const SUPERSEDE_REASON =
  "Superseded due to agreement template correction prior to signature";

export interface ReissueResult {
  ok: boolean;
  reason?: string;
  supersededAgreementId?: string;
  newAgreement?: Record<string, unknown>;
}

/** Cancel the old row — STATUS ONLY (plus an audit note). Snapshot, sent_at,
 *  viewed_at, sign_token and signatures are left untouched. Returns an error
 *  code, or null on success. Optimistic on the read status for concurrency. */
async function cancelSupersededAgreement(
  old: { id: string; agreement_status?: string | null; internal_notes?: string | null },
  userId: string,
): Promise<string | null> {
  const stamp = new Date().toISOString();
  const note = old.internal_notes
    ? `${old.internal_notes}\n[${stamp}] ${SUPERSEDE_REASON}`
    : `[${stamp}] ${SUPERSEDE_REASON}`;
  const { error } = await supabaseAdmin
    .from("purchase_agreements")
    .update({ agreement_status: "cancelled", internal_notes: note, updated_at: stamp })
    .eq("id", old.id)
    .eq("agreement_status", old.agreement_status);
  if (error) return `cancel_failed:${error.message}`;
  await logAgreementActivity(
    old.id,
    userId,
    "superseded",
    `Agreement cancelled prior to signature — ${SUPERSEDE_REASON}`,
  );
  return null;
}

/** Durable evidence that the order has already been invoiced (financial-spine
 *  link, a public.invoices row, or invoice_status sent/paid). */
async function orderAlreadyInvoiced(orderId: string): Promise<boolean> {
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("invoice_status, financial_spine_invoice_id")
    .eq("id", orderId)
    .maybeSingle();
  const { data: inv } = await supabaseAdmin
    .from("invoices")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  return invoiceAlreadyExists({
    financialSpineInvoiceId: order?.financial_spine_invoice_id,
    hasCanonicalInvoiceRow: !!inv,
    invoiceStatus: order?.invoice_status,
  }).skip;
}

/** Correct the order's DERIVED state after supersession: the cancelled
 *  agreement is no longer out, so the CRM must not show "awaiting signature".
 *  Only the derived fields are touched — invoice_status, payment_status and
 *  total_value are deliberately preserved. deriveFlowState then surfaces
 *  "Process Order & Send Agreement" (review → send the replacement). */
async function resetOrderStateForReplacement(orderId: string, userId: string): Promise<void> {
  await supabaseAdmin
    .from("sales_orders")
    .update({
      order_status: "draft",
      agreement_status: "not_sent",
      next_required_action: "Review and send replacement agreement",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  await supabaseAdmin.from("order_activity_log").insert({
    order_id: orderId,
    user_id: userId,
    activity_type: "agreement_superseded",
    description:
      "Prior agreement cancelled; replacement draft created — awaiting review before send.",
  });
}

/** After the fresh draft exists: (1) if the order is already invoiced, clear
 *  its auto-invoice-on-signing flag; (2) fix the order's stale derived state. */
async function finalizeReplacement(
  orderId: string,
  newAgreement: Record<string, unknown>,
  userId: string,
): Promise<void> {
  if (await orderAlreadyInvoiced(orderId)) {
    const newId = String(newAgreement.id);
    await supabaseAdmin
      .from("purchase_agreements")
      .update({ auto_send_invoice_on_signing: false, updated_at: new Date().toISOString() })
      .eq("id", newId);
    newAgreement.auto_send_invoice_on_signing = false;
  }
  await resetOrderStateForReplacement(orderId, userId);
}

/**
 * Cancel `supersededAgreementId` and create a fresh draft replacement for
 * `orderId`. Idempotent: once the old row is cancelled, a repeat call fails
 * the canSupersede guard, and a repeat upsert would only refresh the draft
 * (created=false) rather than inserting a second replacement — so at most one
 * replacement is ever produced.
 */
export async function createReplacementAgreementForOrder(
  orderId: string,
  supersededAgreementId: string,
  userId: string,
): Promise<ReissueResult> {
  const { data: old } = await supabaseAdmin
    .from("purchase_agreements")
    .select(
      "id, order_id, agreement_status, operator_signed_at, apex_signed_at, internal_notes",
    )
    .eq("id", supersededAgreementId)
    .maybeSingle();

  if (!old) return { ok: false, reason: "superseded_agreement_not_found" };
  if (old.order_id !== orderId) return { ok: false, reason: "agreement_order_mismatch" };

  const assessment = canSupersede(old);
  if (!assessment.ok) return { ok: false, reason: assessment.reason };

  // Cancel the old row (status only + audit note), preserving the historical
  // document verbatim so the sign guards refuse any further signature on it.
  const cancelErr = await cancelSupersededAgreement(old, userId);
  if (cancelErr) return { ok: false, reason: cancelErr };

  // With the old row cancelled, upsert finds no live agreement and inserts a
  // fresh DRAFT from the current canonical snapshot (new UUID + sign_token).
  const result = await upsertAgreementForOrder(orderId, userId);
  if (!result.ok) return { ok: false, reason: result.reason ?? "replacement_upsert_failed" };
  if (!result.created) {
    // Another live (non-cancelled) agreement already exists — do NOT produce
    // a duplicate. This guards the concurrent-retry case.
    return { ok: false, reason: "replacement_not_created_live_agreement_exists" };
  }

  const newAgreement = result.agreement as Record<string, unknown>;
  await logAgreementActivity(
    String(newAgreement.id),
    userId,
    "created_as_replacement",
    `Replacement agreement created (draft, unsent) superseding ${supersededAgreementId}`,
  );

  // Clear auto-invoice-on-signing if already invoiced, and correct the order's
  // stale "awaiting signature" derived state.
  await finalizeReplacement(orderId, newAgreement, userId);

  return { ok: true, supersededAgreementId, newAgreement };
}
