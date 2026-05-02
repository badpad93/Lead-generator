import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

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

  if (!body.full_name || !body.email || !body.phone) {
    return NextResponse.json({ error: "Full name, email, and phone are required" }, { status: 400 });
  }

  const { data: purchase, error: purchaseErr } = await supabaseAdmin
    .from("machine_listing_purchases")
    .insert({
      machine_listing_id: listing.id,
      amount_cents: priceInCents,
      full_name: body.full_name,
      email: body.email,
      phone: body.phone,
      buyer_type: body.buyer_type || null,
      business_name: body.business_name || null,
      llc_status: body.llc_status || null,
      location_status: body.location_status || null,
      location_business_name: body.location_business_name || null,
      location_address: body.location_address || null,
      location_city: body.location_city || null,
      location_state: body.location_state || null,
      location_zip: body.location_zip || null,
      site_contact_name: body.site_contact_name || null,
      site_contact_phone: body.site_contact_phone || null,
      site_contact_email: body.site_contact_email || null,
      placement_type: body.placement_type || null,
      preferred_market: body.preferred_market || null,
      desired_location_type: body.desired_location_type || null,
      foot_traffic: body.foot_traffic || null,
      deployment_timeline: body.deployment_timeline || null,
      has_power_outlet: !!body.has_power_outlet,
      has_indoor_placement: !!body.has_indoor_placement,
      has_enough_space: !!body.has_enough_space,
      has_delivery_access: !!body.has_delivery_access,
      connectivity: body.connectivity || null,
      shipping_intent: body.shipping_intent || null,
    })
    .select("id")
    .single();

  if (purchaseErr) {
    return NextResponse.json({ error: "Failed to create purchase record" }, { status: 500 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Payment not configured" }, { status: 500 });

  const stripe = new Stripe(stripeKey);
  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: body.email,
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
      purchase_id: purchase.id,
      type: "machine_purchase",
    },
    success_url: `${origin}/machines-for-sale/${listing.id}?purchased=true`,
    cancel_url: `${origin}/machines-for-sale/${listing.id}`,
  });

  await supabaseAdmin
    .from("machine_listing_purchases")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", purchase.id);

  return NextResponse.json({ url: session.url });
}
