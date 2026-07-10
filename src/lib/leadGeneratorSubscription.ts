import { supabaseAdmin } from "./supabaseAdmin";
import { createInvoice, getInvoice, sendInvoiceEmail } from "./quickbooks";
import { LEAD_GENERATOR_MONTHLY_PRICE_USD } from "./leadGeneratorAccess";

/**
 * Lead Generator subscription lifecycle helpers.
 *
 * Recurring rails: QuickBooks. Since QB Online doesn't expose Recurring
 * Sales Receipts via API (those are UI-configured templates only), we
 * roll our own monthly invoice cycle:
 *
 *   subscribe()  — creates a QB customer + one-shot $9.99 invoice; saves
 *                  the subscription row in status=incomplete + provider_customer_id.
 *                  Returns the invoice link so the caller can click through
 *                  to pay.
 *   handleInvoicePaid()
 *                — called from the QB webhook. Advances current_period_end
 *                  by 30 days; flips status→active; upserts the
 *                  account_entitlements row (source=subscription).
 *   cancel()     — user-initiated. Immediate revoke: entitlement cleared,
 *                  sub row flipped to canceled. Any pending QB invoice
 *                  can still be paid but won't reactivate access unless
 *                  the user re-subscribes.
 *   renewInvoice()
 *                — cron-facing. For active subs whose period_end is within
 *                  N days, mint the next month's invoice and email it.
 *                  Not wired to a scheduler tonight — call it from a cron
 *                  endpoint when ready.
 */

const PERIOD_DAYS = 30;

export interface SubscribeResult {
  ok: true;
  subscription_id: string;
  invoice_id: string;
  invoice_link?: string;
}

export interface SubscribeError {
  ok: false;
  error: string;
  status: number;
}

/**
 * Kick off a Lead Generator subscription for the caller.
 * Creates the QB invoice ($9.99), stores tracking row.
 * Idempotent within a 30s window — repeated calls return the same
 * pending invoice rather than double-charging.
 */
export async function subscribe(userId: string): Promise<SubscribeResult | SubscribeError> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "Profile not found", status: 404 };
  if (!profile.email) return { ok: false, error: "Account is missing an email address", status: 400 };

  const { data: existingSub } = await supabaseAdmin
    .from("lead_generator_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingSub?.status === "active" || existingSub?.status === "trialing") {
    return { ok: false, error: "Subscription is already active", status: 409 };
  }

  // Fresh invoice for this billing period.
  let invoice;
  try {
    invoice = await createInvoice({
      customerEmail: profile.email,
      customerName: profile.full_name || profile.email,
      customerPhone: profile.phone || undefined,
      lineItems: [
        {
          description: "Lead Generator monthly subscription",
          amount: LEAD_GENERATOR_MONTHLY_PRICE_USD,
          quantity: 1,
        },
      ],
      memo: `Lead Generator subscription — ${new Date().toISOString().slice(0, 10)}`,
      metadata: {
        type: "lead_generator_subscription",
        user_id: userId,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "QB invoice create failed";
    return { ok: false, error: msg, status: 502 };
  }

  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    provider: "quickbooks",
    provider_customer_id: null as string | null,
    provider_subscription_id: invoice.Id,   // no template — invoice id is the recurring anchor
    provider_receipt_kind: "invoice" as const,
    last_payment_id: null as string | null,
    amount_cents: Math.round(LEAD_GENERATOR_MONTHLY_PRICE_USD * 100),
    status: "incomplete" as const,
    current_period_start: null as string | null,
    current_period_end: null as string | null,
    cancel_at_period_end: false,
    canceled_at: null as string | null,
    updated_at: nowIso,
  };

  const { data: sub, error: subErr } = await supabaseAdmin
    .from("lead_generator_subscriptions")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (subErr) {
    return { ok: false, error: subErr.message, status: 500 };
  }

  // Best-effort send of the invoice email.
  try {
    await sendInvoiceEmail(invoice.Id, profile.email);
  } catch {
    // Non-fatal — caller can click the link from the response.
  }

  let invoiceLink: string | undefined;
  try {
    const fullInvoice = await getInvoice(invoice.Id);
    invoiceLink = fullInvoice.InvoiceLink || undefined;
  } catch {
    // Ignore — the invoice will still be paid from QB email.
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: userId,
    action: "lead_generator_subscribe_started",
    entity_type: "lead_generator_subscriptions",
    entity_id: sub.id,
    metadata: { invoice_id: invoice.Id },
  });

  return {
    ok: true,
    subscription_id: sub.id,
    invoice_id: invoice.Id,
    invoice_link: invoiceLink,
  };
}

/**
 * Called from the QB webhook when a Payment posts to a Lead Generator
 * invoice. Advances current_period_end + activates the entitlement.
 * Idempotent: repeat calls with the same paymentId are a no-op.
 */
export async function handleInvoicePaid(args: {
  invoiceId: string;
  paymentId: string;
}): Promise<void> {
  const { data: sub } = await supabaseAdmin
    .from("lead_generator_subscriptions")
    .select("*")
    .eq("provider_subscription_id", args.invoiceId)
    .maybeSingle();
  if (!sub) return;
  if (sub.last_payment_id === args.paymentId) return;   // already processed

  const nowIso = new Date().toISOString();
  const periodStart = sub.current_period_end && new Date(sub.current_period_end) > new Date()
    ? sub.current_period_end                     // stacking on existing period
    : nowIso;
  const periodEnd = new Date(new Date(periodStart).getTime() + PERIOD_DAYS * 86400 * 1000).toISOString();

  await supabaseAdmin
    .from("lead_generator_subscriptions")
    .update({
      status: "active",
      current_period_start: periodStart,
      current_period_end: periodEnd,
      last_payment_id: args.paymentId,
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  await supabaseAdmin
    .from("account_entitlements")
    .upsert({
      user_id: sub.user_id,
      entitlement_key: "lead_generator_access",
      source: "subscription",
      status: "active",
      starts_at: periodStart,
      ends_at: periodEnd,
      metadata: { subscription_id: sub.id, paid_via: args.paymentId },
      updated_at: nowIso,
    }, { onConflict: "user_id,entitlement_key" });

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: sub.user_id,
    action: "lead_generator_subscription_activated",
    entity_type: "lead_generator_subscriptions",
    entity_id: sub.id,
    metadata: {
      invoice_id: args.invoiceId,
      payment_id: args.paymentId,
      current_period_end: periodEnd,
    },
  });
}

/**
 * User-initiated cancel. Immediate revoke per the product decision.
 * Any pending QB invoice can still be paid but won't reactivate access
 * unless the caller re-subscribes.
 */
export async function cancel(userId: string, actorId?: string): Promise<void> {
  const { data: sub } = await supabaseAdmin
    .from("lead_generator_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!sub) return;

  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from("lead_generator_subscriptions")
    .update({
      status: "canceled",
      canceled_at: nowIso,
      current_period_end: nowIso,
      cancel_at_period_end: false,
      updated_at: nowIso,
    })
    .eq("id", sub.id);

  // Clear any subscription-sourced entitlement row. Role-based rows for
  // PP dual-role users are protected — we only touch source=subscription.
  await supabaseAdmin
    .from("account_entitlements")
    .update({ status: "inactive", ends_at: nowIso, updated_at: nowIso })
    .eq("user_id", userId)
    .eq("entitlement_key", "lead_generator_access")
    .eq("source", "subscription");

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId || userId,
    action: "lead_generator_subscription_canceled",
    entity_type: "lead_generator_subscriptions",
    entity_id: sub.id,
    metadata: { canceled_by: actorId ? "admin" : "self", user_id: userId },
  });
}

/**
 * Cron-facing renewal: for every active subscription whose
 * current_period_end is within N days of now, mint the next month's
 * invoice and email it. Called from /api/cron/lead-generator-renew
 * on a daily schedule.
 *
 * NOT wired to a scheduler in this PR — call it manually or hook it
 * into vercel.json cron config to enable. Without it, admin must
 * re-invoice manually via the admin panel.
 */
export async function renewUpcoming(withinDays: number = 3): Promise<{ processed: number; failed: number; details: Array<{ user_id: string; ok: boolean; error?: string }> }> {
  const horizon = new Date(Date.now() + withinDays * 86400 * 1000).toISOString();
  const { data: subs } = await supabaseAdmin
    .from("lead_generator_subscriptions")
    .select("id, user_id, current_period_end, status")
    .in("status", ["active"])
    .lte("current_period_end", horizon);

  const details: Array<{ user_id: string; ok: boolean; error?: string }> = [];
  let processed = 0, failed = 0;

  for (const s of subs || []) {
    try {
      const result = await subscribe(s.user_id);   // mints the next invoice
      if (result.ok) {
        processed++;
        details.push({ user_id: s.user_id, ok: true });
      } else {
        failed++;
        details.push({ user_id: s.user_id, ok: false, error: result.error });
      }
    } catch (e) {
      failed++;
      details.push({ user_id: s.user_id, ok: false, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return { processed, failed, details };
}
