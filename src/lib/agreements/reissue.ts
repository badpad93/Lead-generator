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
 * normal send flow mails it afterward. Order/invoice/payment state is left
 * untouched (no invoice is created, Invoice 779 and invoice_status/
 * payment_status are not touched).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { upsertAgreementForOrder } from "@/lib/agreements/sync";
import { canSupersede } from "@/lib/agreements/supersedeGuard";

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

  await logAgreementActivity(
    String((result.agreement as { id: string }).id),
    userId,
    "created_as_replacement",
    `Replacement agreement created (draft, unsent) superseding ${supersededAgreementId}`,
  );

  return { ok: true, supersededAgreementId, newAgreement: result.agreement };
}
