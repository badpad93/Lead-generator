import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const { data: agreement } = await supabaseAdmin
    .from("agreement_tokens")
    .select("id, pipeline_item_id, step_id, recipient_email, recipient_name, pricing_price, status, sales_accounts(business_name)")
    .eq("token", token)
    .single();

  if (!agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (agreement.status === "paid") {
    return NextResponse.json({ error: "Agreement already paid" }, { status: 400 });
  }

  if (agreement.status !== "signed") {
    return NextResponse.json({ error: "Please sign the agreement before paying" }, { status: 400 });
  }

  const stripe = new Stripe(stripeKey);
  const siteUrl = getSiteUrl();
  const amountCents = Math.round(Number(agreement.pricing_price) * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: agreement.recipient_email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: "Location Placement Fee",
            description: `Vending location placement — ${(agreement.sales_accounts as unknown as { business_name: string } | null)?.business_name || "Location"}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      agreement_token_id: agreement.id,
      pipeline_item_id: agreement.pipeline_item_id,
      step_id: agreement.step_id,
      type: "agreement_payment",
    },
    success_url: `${siteUrl}/agreements/${token}?paid=true`,
    cancel_url: `${siteUrl}/agreements/${token}?canceled=true`,
  });

  // Store stripe session ID on agreement
  await supabaseAdmin
    .from("agreement_tokens")
    .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", agreement.id);

  return NextResponse.json({ url: session.url });
}
