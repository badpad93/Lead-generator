import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const PLATFORM_FEE_RATE = 0.15;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: listing } = await supabaseAdmin
    .from("user_listings")
    .select("*")
    .eq("id", id)
    .eq("status", "active")
    .eq("is_public", true)
    .single();

  if (!listing) {
    return NextResponse.json({ error: "Listing not found or no longer available" }, { status: 404 });
  }

  if (listing.seller_id === user.id) {
    return NextResponse.json({ error: "You cannot purchase your own listing" }, { status: 400 });
  }

  const { data: existingPurchase } = await supabaseAdmin
    .from("user_listing_purchases")
    .select("id")
    .eq("listing_id", id)
    .eq("status", "completed")
    .maybeSingle();

  if (existingPurchase) {
    return NextResponse.json({ error: "This listing has already been sold" }, { status: 409 });
  }

  const { data: sellerProfile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_account_id, stripe_onboarding_complete")
    .eq("id", listing.seller_id)
    .single();

  if (!sellerProfile?.stripe_account_id || !sellerProfile.stripe_onboarding_complete) {
    return NextResponse.json(
      { error: "Seller's payment account is not set up. Contact them directly." },
      { status: 400 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY!);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  const amountCents = Math.round(Number(listing.price) * 100);
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: listing.title,
            description: `${listing.listing_type === "lead" ? "Vending Lead" : listing.listing_type === "location" ? "Location" : "Route"} in ${listing.city || ""}, ${listing.state}`.trim(),
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents,
      transfer_data: {
        destination: sellerProfile.stripe_account_id,
      },
    },
    metadata: {
      type: "marketplace_purchase",
      listing_id: listing.id,
      buyer_id: user.id,
      seller_id: listing.seller_id,
    },
    success_url: `${siteUrl}/marketplace/${listing.id}?purchased=true`,
    cancel_url: `${siteUrl}/marketplace/${listing.id}?canceled=true`,
  });

  await supabaseAdmin.from("user_listing_purchases").insert({
    listing_id: listing.id,
    buyer_id: user.id,
    seller_id: listing.seller_id,
    amount_cents: amountCents,
    platform_fee_cents: platformFeeCents,
    seller_payout_cents: amountCents - platformFeeCents,
    stripe_checkout_session_id: session.id,
    status: "pending",
  });

  return NextResponse.json({ url: session.url });
}
