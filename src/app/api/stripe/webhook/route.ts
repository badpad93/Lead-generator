import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type Stripe from "stripe";

/** Extract current_period_end from a subscription (lives on the first item in newer Stripe API versions) */
function getPeriodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0];
  if (item?.current_period_end) {
    return new Date(item.current_period_end * 1000).toISOString();
  }
  return null;
}

/** POST /api/stripe/webhook — handle Stripe webhook events */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.user_id;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;

      if (userId && customerId && subscriptionId) {
        // Fetch the subscription to get period details
        const sub = await getStripe().subscriptions.retrieve(subscriptionId);

        await supabaseAdmin.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: sub.status,
            current_period_end: getPeriodEnd(sub),
            cancel_at_period_end: sub.cancel_at_period_end,
          },
          { onConflict: "user_id" }
        );
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;

      const updateData = {
        status: sub.status,
        current_period_end: getPeriodEnd(sub),
        cancel_at_period_end: sub.cancel_at_period_end,
      };

      if (userId) {
        await supabaseAdmin
          .from("subscriptions")
          .update(updateData)
          .eq("user_id", userId);
      } else {
        // Fallback: look up by stripe_subscription_id
        await supabaseAdmin
          .from("subscriptions")
          .update(updateData)
          .eq("stripe_subscription_id", sub.id);
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // In newer Stripe API, subscription ID is under parent.subscription_details
      const subscriptionId =
        (invoice.parent as { subscription_details?: { subscription?: string } })
          ?.subscription_details?.subscription;

      if (subscriptionId) {
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("stripe_subscription_id", subscriptionId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
