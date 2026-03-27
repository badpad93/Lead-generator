import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/** POST /api/checkout — create a Stripe Checkout Session for a lead purchase */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;

  const body = await req.json();
  const { requestId, agreementId } = body;

  if (!requestId) {
    return NextResponse.json(
      { error: "requestId is required" },
      { status: 400 }
    );
  }

  // Enforce signed agreement before purchase
  if (!agreementId) {
    return NextResponse.json(
      { error: "You must sign the Lead Purchase Agreement before purchasing" },
      { status: 400 }
    );
  }

  // Verify the agreement exists, belongs to this user, and matches this lead
  const { data: agreement, error: agreementError } = await supabaseAdmin
    .from("signed_agreements")
    .select("id, user_id, lead_id, accepted_terms, accepted_population_clause, accepted_esign")
    .eq("id", agreementId)
    .single();

  if (agreementError || !agreement) {
    return NextResponse.json(
      { error: "Agreement not found. Please sign the agreement first." },
      { status: 400 }
    );
  }

  if (agreement.user_id !== userId) {
    return NextResponse.json(
      { error: "Agreement does not belong to this user" },
      { status: 403 }
    );
  }

  if (agreement.lead_id !== requestId) {
    return NextResponse.json(
      { error: "Agreement does not match this lead" },
      { status: 400 }
    );
  }

  if (!agreement.accepted_terms || !agreement.accepted_population_clause || !agreement.accepted_esign) {
    return NextResponse.json(
      { error: "Agreement is incomplete. All terms must be accepted." },
      { status: 400 }
    );
  }

  // Check if already purchased by anyone
  const { data: existing } = await supabaseAdmin
    .from("lead_purchases")
    .select("id, user_id")
    .eq("request_id", requestId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (existing) {
    const msg =
      existing.user_id === userId
        ? "You have already purchased this lead"
        : "This lead has already been purchased";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Fetch the lead to get the price
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("vending_requests")
    .select("id, title, price, city, state")
    .eq("id", requestId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.price == null || lead.price <= 0) {
    return NextResponse.json(
      { error: "This lead is not available for purchase. Contact admin at contact@bytebitevending.com" },
      { status: 400 }
    );
  }

  const amountCents = Math.round(lead.price * 100);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Lead: ${lead.title}`,
            description: `Vending lead in ${lead.city}, ${lead.state}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      user_id: userId,
      request_id: requestId,
      agreement_id: agreementId,
    },
    success_url: `${siteUrl}/requests/${requestId}?purchased=true`,
    cancel_url: `${siteUrl}/requests/${requestId}?canceled=true`,
  });

  // Create a pending purchase record
  await supabaseAdmin.from("lead_purchases").upsert(
    {
      user_id: userId,
      request_id: requestId,
      stripe_checkout_session_id: session.id,
      amount_cents: amountCents,
      status: "pending",
    },
    { onConflict: "user_id,request_id" }
  );

  return NextResponse.json({ url: session.url });
}
