import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createTransfer } from "@/lib/dwolla";

/**
 * Dwolla release rail for marketplace_payouts.
 *
 * Called when a payout transitions to 'queued' (either because a
 * prepaid contract's accept flow put it there immediately, or because
 * the operator's balance invoice was marked paid). If the partner has
 * a verified Dwolla funding source we push an ACH transfer and flip
 * the payout to 'sent_to_dwolla'. On success or failure this never
 * throws — callers can fire-and-forget and fall back to the QB Bill
 * drain when we return { ok: false }.
 *
 * Money movement is asynchronous: the Dwolla webhook at
 * /api/webhooks/dwolla flips 'sent_to_dwolla' → 'paid' when
 * customer_transfer_completed fires, or → 'failed' on
 * customer_transfer_failed / returned events.
 */

export interface DwollaReleaseResult {
  ok: boolean;
  status:
    | "sent_to_dwolla"
    | "blocked_no_funding_source"
    | "blocked_not_verified"
    | "failed"
    | "skipped_not_queued";
  transferId?: string;
  error?: string;
}

export async function releasePayoutViaDwolla(
  payoutId: string,
): Promise<DwollaReleaseResult> {
  const { data: payout } = await supabaseAdmin
    .from("marketplace_payouts")
    .select(
      "id, submission_id, contract_id, partner_id, amount, currency, status, dwolla_transfer_id",
    )
    .eq("id", payoutId)
    .maybeSingle();

  if (!payout) {
    return { ok: false, status: "failed", error: "payout_not_found" };
  }
  if (payout.dwolla_transfer_id) {
    return { ok: true, status: "sent_to_dwolla", transferId: payout.dwolla_transfer_id };
  }
  if (payout.status !== "queued") {
    return { ok: false, status: "skipped_not_queued" };
  }

  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("id, dwolla_funding_source_id, dwolla_verification_status")
    .eq("id", payout.partner_id)
    .maybeSingle();

  if (!partner?.dwolla_funding_source_id) {
    await stampError(payout.id, "partner_missing_dwolla_funding_source");
    return { ok: false, status: "blocked_no_funding_source" };
  }
  if (partner.dwolla_verification_status !== "verified") {
    await stampError(payout.id, `funding_source_not_verified (${partner.dwolla_verification_status})`);
    return { ok: false, status: "blocked_not_verified" };
  }

  const amountCents = Math.round(Number(payout.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    await stampError(payout.id, "invalid_amount");
    return { ok: false, status: "failed", error: "invalid_amount" };
  }

  try {
    const transfer = await createTransfer({
      destinationFundingSourceUrl: partner.dwolla_funding_source_id,
      amountCents,
      metadata: {
        payout_id: payout.id,
        submission_id: payout.submission_id,
        contract_id: payout.contract_id,
        partner_id: payout.partner_id,
      },
    });

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        status: "sent_to_dwolla",
        dwolla_transfer_id: transfer.transferId,
        dwolla_transfer_status: "pending",
        dwolla_last_attempt_at: nowIso,
        dwolla_error: null,
        sent_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", payout.id);

    try {
      const { notifyPartnerPayoutSent } = await import("@/lib/marketplaceNotifications");
      notifyPartnerPayoutSent(payout.id).catch(() => undefined);
    } catch (notifyErr) {
      console.error("[marketplaceDwolla] notify failed:", notifyErr);
    }

    return { ok: true, status: "sent_to_dwolla", transferId: transfer.transferId };
  } catch (transferErr) {
    const msg = transferErr instanceof Error ? transferErr.message : String(transferErr);
    await stampError(payout.id, msg.slice(0, 500));
    return { ok: false, status: "failed", error: msg };
  }
}

async function stampError(payoutId: string, message: string): Promise<void> {
  await supabaseAdmin
    .from("marketplace_payouts")
    .update({
      dwolla_error: message,
      dwolla_last_attempt_at: new Date().toISOString(),
    })
    .eq("id", payoutId);
}
