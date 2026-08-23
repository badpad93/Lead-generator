import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createTransfer } from "@/lib/dwolla";

/**
 * Manufacturer payout release rail.
 *
 * Called after any event that could satisfy the two release gates:
 *   * shipped_at is set (manufacturer marked shipped)
 *   * payment_settled_at is set (customer payment cleared to VC)
 *
 * When both are set AND the payout hasn't already fired, this
 * helper fires the Dwolla ACH transfer to the manufacturer's
 * Receive-Only funding source (from manufacturer_partners) and
 * stamps the purchase row.
 *
 * Idempotent: safe to call from both the ship endpoint and the
 * mark-payment-settled endpoint — whichever fires second triggers
 * the payout. Returns { ok, status } summary. Never throws;
 * failures leave manufacturer_payout_status='blocked' or 'failed'
 * with a reason in payout_error.
 */

export interface ManufacturerPayoutResult {
  ok: boolean;
  status:
    | "sent_to_dwolla"
    | "awaiting_gates"
    | "already_released"
    | "blocked_no_funding_source"
    | "blocked_not_verified"
    | "blocked_no_amount"
    | "failed";
  transferId?: string;
  error?: string;
}

export async function releaseManufacturerPayoutIfReady(
  purchaseId: string,
): Promise<ManufacturerPayoutResult> {
  const { data: purchase } = await supabaseAdmin
    .from("machine_listing_purchases")
    .select(
      "id, manufacturer_partner_id, manufacturer_proceeds_cents, payment_settled_at, shipped_at, manufacturer_payout_status, payout_dwolla_transfer_id",
    )
    .eq("id", purchaseId)
    .maybeSingle();

  if (!purchase) return { ok: false, status: "failed", error: "purchase_not_found" };
  if (!purchase.manufacturer_partner_id) {
    // Legacy user-posted purchase — nothing to pay out.
    return { ok: false, status: "failed", error: "not_a_manufacturer_purchase" };
  }
  if (purchase.payout_dwolla_transfer_id) {
    return {
      ok: true,
      status: "already_released",
      transferId: purchase.payout_dwolla_transfer_id,
    };
  }

  // Two-gate check
  const bothGatesMet = !!purchase.payment_settled_at && !!purchase.shipped_at;
  if (!bothGatesMet) {
    // Reflect partial-gate progress on the row so admin dashboards
    // don't have to derive it from timestamps.
    const nextStatus =
      purchase.payment_settled_at || purchase.shipped_at
        ? "awaiting_gates"
        : "pending";
    if (purchase.manufacturer_payout_status !== nextStatus) {
      await supabaseAdmin
        .from("machine_listing_purchases")
        .update({ manufacturer_payout_status: nextStatus })
        .eq("id", purchaseId);
    }
    return { ok: true, status: "awaiting_gates" };
  }

  const amountCents = purchase.manufacturer_proceeds_cents as number | null;
  if (!amountCents || amountCents <= 0) {
    await stampError(purchaseId, "invalid_or_zero_proceeds_amount", "blocked");
    return { ok: false, status: "blocked_no_amount" };
  }

  // Look up the partner's Dwolla funding source. Reuses the same
  // Receive-Only pattern established for placement partners +
  // contractors.
  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("id, dwolla_funding_source_url, dwolla_verified_at")
    .eq("id", purchase.manufacturer_partner_id)
    .maybeSingle();

  if (!partner?.dwolla_funding_source_url) {
    await stampError(purchaseId, "partner_missing_dwolla_funding_source", "blocked");
    return { ok: false, status: "blocked_no_funding_source" };
  }
  if (!partner.dwolla_verified_at) {
    await stampError(purchaseId, "funding_source_not_verified", "blocked");
    return { ok: false, status: "blocked_not_verified" };
  }

  try {
    const transfer = await createTransfer({
      destinationFundingSourceUrl: partner.dwolla_funding_source_url,
      amountCents,
      metadata: {
        purchase_id: purchase.id,
        manufacturer_partner_id: partner.id,
        source: "machine_listing_purchase",
      },
    });

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("machine_listing_purchases")
      .update({
        manufacturer_payout_status: "sent_to_dwolla",
        payout_dwolla_transfer_id: transfer.transferId,
        payout_released_at: nowIso,
        payout_last_attempt_at: nowIso,
        payout_error: null,
      })
      .eq("id", purchaseId);

    return { ok: true, status: "sent_to_dwolla", transferId: transfer.transferId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await stampError(purchaseId, msg.slice(0, 500), "failed");
    return { ok: false, status: "failed", error: msg };
  }
}

async function stampError(
  purchaseId: string,
  message: string,
  status: "blocked" | "failed",
) {
  await supabaseAdmin
    .from("machine_listing_purchases")
    .update({
      manufacturer_payout_status: status,
      payout_error: message,
      payout_last_attempt_at: new Date().toISOString(),
    })
    .eq("id", purchaseId);
}
