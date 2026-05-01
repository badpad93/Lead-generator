import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, title, buy_now_enabled, buy_now_price, asking_price, status")
    .eq("id", id)
    .single();

  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  if (!listing.buy_now_enabled) return NextResponse.json({ error: "Buy now not available for this listing" }, { status: 400 });
  if (listing.status !== "active") return NextResponse.json({ error: "Listing is no longer available" }, { status: 400 });

  const priceInCents = listing.buy_now_price || (listing.asking_price ? listing.asking_price * 100 : null);
  if (!priceInCents) return NextResponse.json({ error: "No price set for this listing" }, { status: 400 });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Payment not configured" }, { status: 500 });

  const stripe = new Stripe(stripeKey);
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: listing.title,
            description: `Vending machine purchase — ${listing.title}`,
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      machine_listing_id: listing.id,
      type: "machine_purchase",
    },
    success_url: `${origin}/machines-for-sale/${listing.id}?purchased=true`,
    cancel_url: `${origin}/machines-for-sale/${listing.id}`,
  });

  return NextResponse.json({ url: session.url });
}
