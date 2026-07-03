import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  handleLeadPurchaseCompleted,
  handleAgreementPaymentCompleted,
  handleMachinePurchaseCompleted,
  handleCoffeeOrderCompleted,
  handleMarketplacePurchaseCompleted,
  handlePaymentExpired,
} from "@/lib/paymentHandlers";
import { recordPaymentEvent, markEventProcessed } from "@/lib/paymentLedger";
import { ingestStripeEvent } from "@/lib/paymentIngest";

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY is not configured");
    throw new Error("Stripe not configured");
  }
  return new Stripe(key);
}

function verifyWebhookEvent(stripe: Stripe, body: string, signature: string): Stripe.Event {
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter(Boolean) as string[];

  if (secrets.length === 0) throw new Error("No webhook secrets configured");

  let lastError: Error | null = null;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Invalid signature");
    }
  }
  throw lastError;
}

export async function POST(req: NextRequest) {
  let stripe: Stripe;
  try {
    stripe = getStripeClient();
  } catch {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = verifyWebhookEvent(stripe, body, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Financial spine — log the event and short-circuit on duplicate deliveries.
  // Downstream handlers (below) only fire on the first successful delivery,
  // so re-tries never double-write commissions/emails/downstream side-effects.
  let ledgerEventId: string | null = null;
  try {
    const { event: eventRow, alreadyProcessed } = await recordPaymentEvent({
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      signatureVerified: true,
      payload: event as unknown as Record<string, unknown>,
    });
    if (alreadyProcessed) {
      return NextResponse.json({ received: true, idempotent: true });
    }
    ledgerEventId = eventRow.id;
    // Best-effort — write an invoice/payment row in the canonical ledger.
    // Failure here doesn't block the existing downstream handlers.
    try {
      await ingestStripeEvent(event, eventRow.id);
    } catch (ingestErr) {
      console.error("[stripe-webhook] ledger ingest failed (non-fatal):", ingestErr);
    }
  } catch (logErr) {
    console.error("[stripe-webhook] event log write failed (proceeding):", logErr);
  }

  try {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    if (session.metadata?.type === "coffee_order") {
      await handleCoffeeOrderCompleted({
        orderId: session.metadata.order_id,
        userId: session.metadata.user_id,
        paymentId: paymentIntentId,
        buyerEmail: session.customer_details?.email ?? null,
      });
      return NextResponse.json({ received: true });
    }

    if (session.metadata?.type === "agreement_payment") {
      await handleAgreementPaymentCompleted({
        agreementTokenId: session.metadata.agreement_token_id,
        pipelineItemId: session.metadata.pipeline_item_id,
        stepId: session.metadata.step_id,
        paymentId: paymentIntentId,
      });
      return NextResponse.json({ received: true });
    }

    if (session.metadata?.type === "machine_purchase") {
      await handleMachinePurchaseCompleted({
        purchaseId: session.metadata.purchase_id,
        listingId: session.metadata.machine_listing_id,
        paymentId: paymentIntentId,
      });
      return NextResponse.json({ received: true });
    }

    if (session.metadata?.type === "featured_operator") {
      await handleFeaturedSubscription(session);
      return NextResponse.json({ received: true });
    }

    if (session.metadata?.type === "marketplace_purchase") {
      await handleMarketplacePurchaseCompleted({
        sessionId: session.id,
        listingId: session.metadata.listing_id,
        buyerId: session.metadata.buyer_id,
        sellerId: session.metadata.seller_id,
        paymentId: paymentIntentId,
        buyerEmail: session.customer_details?.email ?? null,
      });
      return NextResponse.json({ received: true });
    }

    // Default: lead purchase (no specific type in metadata)
    const userId = session.metadata?.user_id;
    const requestId = session.metadata?.request_id;
    if (userId && requestId) {
      await handleLeadPurchaseCompleted({
        sessionId: session.id,
        userId,
        requestId,
        agreementId: session.metadata?.agreement_id,
        buyerEmail: session.customer_details?.email ?? null,
        paymentId: paymentIntentId,
      });
    }
  }

  // Pipeline payment reconciliation (backup for PandaDoc+Stripe flow)
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const pipelineItemId = paymentIntent.metadata?.pipeline_item_id;
    const stepId = paymentIntent.metadata?.step_id;

    if (pipelineItemId && stepId) {
      await supabaseAdmin
        .from("pipeline_payments")
        .update({
          status: "completed",
          stripe_payment_intent_id: paymentIntent.id,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("pipeline_item_id", pipelineItemId)
        .eq("step_id", stepId)
        .in("status", ["pending", "created"]);
    }
  }

  // Handle subscription cancellation — remove featured status
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    if (subscription.metadata?.type === "featured_operator") {
      const userId = subscription.metadata.user_id;
      if (userId) {
        await supabaseAdmin
          .from("profiles")
          .update({ featured: false, stripe_subscription_id: null })
          .eq("id", userId);
        console.log(`[stripe-webhook] Removed featured status for user ${userId}`);
      }
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handlePaymentExpired(session.id);
  }

  // Handle Stripe Connect account updates — mark onboarding complete
  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    if (account.details_submitted || (account.charges_enabled && account.payouts_enabled)) {
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_onboarding_complete: true })
        .eq("stripe_account_id", account.id);
      console.log(`[stripe-webhook] Connect account ${account.id} onboarding complete`);
    }
  }
  } finally {
    // Mark the event row processed regardless of whether the specific
    // event type had a handler here — a "handled" event means "we saw it
    // and won't reprocess". Retries after an uncaught throw skip this,
    // so recovery via Stripe's built-in retries still works.
    if (ledgerEventId) {
      await markEventProcessed(ledgerEventId).catch(() => undefined);
    }
  }

  return NextResponse.json({ received: true });
}

async function handleFeaturedSubscription(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const state = session.metadata?.state;
  if (!userId) return;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  const { count } = await supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "operator")
    .eq("featured", true)
    .eq("state", state || "")
    .neq("id", userId);

  if ((count || 0) >= 3) {
    console.error(`[stripe-webhook] Featured slots full for ${state}, cancelling subscription ${subscriptionId}`);
    if (subscriptionId) {
      const stripeClient = getStripeClient();
      await stripeClient.subscriptions.cancel(subscriptionId);
    }
    return;
  }

  await supabaseAdmin
    .from("profiles")
    .update({
      featured: true,
      stripe_subscription_id: subscriptionId,
    })
    .eq("id", userId);

  console.log(`[stripe-webhook] User ${userId} is now a featured operator in ${state}`);
}
