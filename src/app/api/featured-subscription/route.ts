import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const FEATURED_PRICE = 2999; // $29.99 in cents
const MAX_FEATURED_PER_STATE = 3;

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
}

/** GET /api/featured-subscription — check featured status and available slots */
export async function GET(req: NextRequest) {
  const stateParam = req.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();

  let currentUserFeatured = false;
  let currentUserState: string | null = null;
  let stripeSubscriptionId: string | null = null;

  if (user) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("featured, state, stripe_subscription_id")
      .eq("id", user.id)
      .single();

    currentUserFeatured = profile?.featured === true;
    currentUserState = profile?.state || null;
    stripeSubscriptionId = profile?.stripe_subscription_id || null;
  }

  const checkState = stateParam || currentUserState;
  let slotsAvailable = MAX_FEATURED_PER_STATE;

  if (checkState) {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "operator")
      .eq("featured", true)
      .eq("state", checkState);

    slotsAvailable = MAX_FEATURED_PER_STATE - (count || 0);
  }

  return NextResponse.json({
    featured: currentUserFeatured,
    state: checkState,
    slots_available: slotsAvailable,
    max_per_state: MAX_FEATURED_PER_STATE,
    price_cents: FEATURED_PRICE,
    has_subscription: !!stripeSubscriptionId,
  });
}

/** POST /api/featured-subscription — create Stripe Checkout for featured subscription */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, state, featured, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "operator") {
    return NextResponse.json({ error: "Only operators can subscribe" }, { status: 403 });
  }

  if (profile.featured) {
    return NextResponse.json({ error: "Already a featured operator" }, { status: 409 });
  }

  if (!profile.state) {
    return NextResponse.json({ error: "Set your state in your profile before subscribing" }, { status: 422 });
  }

  // Check slots
  const { count } = await supabaseAdmin
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "operator")
    .eq("featured", true)
    .eq("state", profile.state);

  if ((count || 0) >= MAX_FEATURED_PER_STATE) {
    return NextResponse.json(
      { error: `All ${MAX_FEATURED_PER_STATE} featured spots are taken in ${profile.state}` },
      { status: 409 }
    );
  }

  // Get or create Stripe customer
  let customerId = profile.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // Create a Stripe Checkout Session in subscription mode
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price_data: {
          currency: "usd",
          recurring: { interval: "month" },
          product_data: {
            name: "Featured Operator Subscription",
            description: `Featured operator listing in ${profile.state} — full profile visibility, priority placement`,
          },
          unit_amount: FEATURED_PRICE,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: "featured_operator",
      user_id: user.id,
      state: profile.state,
    },
    subscription_data: {
      metadata: {
        type: "featured_operator",
        user_id: user.id,
        state: profile.state,
      },
    },
    success_url: `${getSiteUrl()}/dashboard?featured=success`,
    cancel_url: `${getSiteUrl()}/dashboard?featured=cancelled`,
  });

  return NextResponse.json({ url: session.url });
}

/** DELETE /api/featured-subscription — cancel featured subscription */
export async function DELETE(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); }, setAll() {} } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_subscription_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_subscription_id) {
    return NextResponse.json({ error: "No active subscription" }, { status: 404 });
  }

  await stripe.subscriptions.update(profile.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  return NextResponse.json({ ok: true, message: "Subscription will cancel at end of billing period" });
}
