import { NextRequest, NextResponse } from "next/server";
import { getStripe, PRICE_ID } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** POST /api/stripe/checkout — create a Stripe Checkout session for the $19.99/mo subscription */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user email for Stripe customer
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (!profile?.email) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Check if user already has a Stripe customer ID
  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("user_id", userId)
    .single();

  if (existingSub?.status === "active") {
    return NextResponse.json({ error: "Already subscribed" }, { status: 400 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  let customerId = existingSub?.stripe_customer_id;

  if (!customerId) {
    // Create a new Stripe customer
    const customer = await getStripe().customers.create({
      email: profile.email,
      metadata: { user_id: userId },
    });
    customerId = customer.id;
  }

  // Create the Checkout session
  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: PRICE_ID, quantity: 1 }],
    success_url: `${siteUrl}/dashboard?subscribed=true`,
    cancel_url: `${siteUrl}/pricing`,
    subscription_data: {
      metadata: { user_id: userId },
    },
    metadata: { user_id: userId },
  });

  return NextResponse.json({ url: session.url });
}
