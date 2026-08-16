import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Stripe Connect release rail for marketplace_payouts.
 *
 * The existing QB Bill flow (src/lib/marketplaceQb.ts) still works.
 * This module is the *additional* rail we fire first when a payout
 * transitions into 'queued' — the moment the operator's balance
 * invoice clears (see /api/admin/marketplace/operator-invoices/[id]/
 * mark-paid).
 *
 * Behavior:
 *  - If the partner has a Stripe Connect account with payouts enabled,
 *    fire stripe.transfers.create() and stamp status='stripe_paid' +
 *    stripe_transfer_id + paid_at.
 *  - If the partner has no connected account, or payouts aren't
 *    enabled, or Stripe rejects the transfer, stash the reason in
 *    stripe_error / stripe_last_attempt_at and leave status='queued'
 *    so the QB Bill drain can pick it up as before.
 *
 * This never throws — callers can invoke fire-and-forget after
 * dropping a payout to 'queued'. Returns a summary object for callers
 * that want to log or surface the outcome.
 */

let _stripe: Stripe | null = null;
function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[marketplaceStripe] STRIPE_SECRET_KEY not configured");
    return null;
  }
  _stripe = new Stripe(key);
  return _stripe;
}

export interface StripeReleaseResult {
  ok: boolean;
  status:
    | "stripe_paid"
    | "blocked_no_account"
    | "blocked_payouts_disabled"
    | "failed"
    | "skipped_not_queued";
  transferId?: string;
  error?: string;
}

export async function releasePayoutViaStripe(
  payoutId: string,
): Promise<StripeReleaseResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { ok: false, status: "failed", error: "stripe_not_configured" };
  }

  const { data: payout } = await supabaseAdmin
    .from("marketplace_payouts")
    .select(
      "id, submission_id, contract_id, partner_id, amount, currency, status, stripe_transfer_id",
    )
    .eq("id", payoutId)
    .maybeSingle();

  if (!payout) {
    return { ok: false, status: "failed", error: "payout_not_found" };
  }
  if (payout.stripe_transfer_id) {
    return {
      ok: true,
      status: "stripe_paid",
      transferId: payout.stripe_transfer_id,
    };
  }
  if (payout.status !== "queued") {
    return { ok: false, status: "skipped_not_queued" };
  }

  // Partner → profile → stripe_account_id. placement_partners.id is a
  // 1:1 mirror of profiles.id, so a single lookup gets everything.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, stripe_account_id, stripe_onboarding_complete")
    .eq("id", payout.partner_id)
    .maybeSingle();

  if (!profile?.stripe_account_id) {
    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        stripe_error: "partner_missing_stripe_account",
        stripe_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", payout.id);
    return { ok: false, status: "blocked_no_account" };
  }

  // Ask Stripe about the account so we don't fire a transfer to an
  // account that hasn't finished onboarding — this saves us a Stripe
  // billable API error and gives clearer bookkeeping.
  try {
    const account = await stripe.accounts.retrieve(profile.stripe_account_id);
    if (!account.payouts_enabled) {
      await supabaseAdmin
        .from("marketplace_payouts")
        .update({
          stripe_error: "payouts_disabled_on_connect_account",
          stripe_last_attempt_at: new Date().toISOString(),
        })
        .eq("id", payout.id);
      return { ok: false, status: "blocked_payouts_disabled" };
    }
  } catch (accountErr) {
    const msg = accountErr instanceof Error ? accountErr.message : String(accountErr);
    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        stripe_error: `account_lookup_failed: ${msg}`.slice(0, 500),
        stripe_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", payout.id);
    return { ok: false, status: "failed", error: msg };
  }

  const amountCents = Math.round(Number(payout.amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        stripe_error: "invalid_amount",
        stripe_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", payout.id);
    return { ok: false, status: "failed", error: "invalid_amount" };
  }

  const transferGroup = `payout_${payout.id}`;

  try {
    const transfer = await stripe.transfers.create({
      amount: amountCents,
      currency: (payout.currency ?? "USD").toLowerCase(),
      destination: profile.stripe_account_id,
      transfer_group: transferGroup,
      description: `Marketplace payout — submission ${payout.submission_id}`,
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
        status: "stripe_paid",
        stripe_transfer_id: transfer.id,
        stripe_transfer_group: transferGroup,
        stripe_last_attempt_at: nowIso,
        stripe_error: null,
        sent_at: nowIso,
        paid_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", payout.id);

    // Fire the existing PP notification — it's amount-driven and
    // doesn't care about the rail.
    try {
      const { notifyPartnerPayoutSent } = await import("@/lib/marketplaceNotifications");
      notifyPartnerPayoutSent(payout.id).catch(() => undefined);
    } catch (notifyErr) {
      console.error("[marketplaceStripe] notify failed:", notifyErr);
    }

    return { ok: true, status: "stripe_paid", transferId: transfer.id };
  } catch (transferErr) {
    const msg = transferErr instanceof Error ? transferErr.message : String(transferErr);
    await supabaseAdmin
      .from("marketplace_payouts")
      .update({
        stripe_error: msg.slice(0, 500),
        stripe_last_attempt_at: new Date().toISOString(),
      })
      .eq("id", payout.id);
    return { ok: false, status: "failed", error: msg };
  }
}
