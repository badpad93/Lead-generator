import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isQuickBooks } from "@/lib/paymentProvider";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const { data: agreement } = await supabaseAdmin
    .from("agreement_tokens")
    .select("id, pipeline_item_id, step_id, recipient_email, recipient_name, pricing_price, status, location_id, sales_accounts(business_name)")
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

  // Verify the location owner has signed their agreement
  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("sales_lead_id")
    .eq("id", agreement.location_id)
    .single();

  if (location?.sales_lead_id) {
    const { data: ownerAgreement } = await supabaseAdmin
      .from("location_agreements")
      .select("id")
      .eq("lead_id", location.sales_lead_id)
      .eq("status", "signed")
      .maybeSingle();

    if (!ownerAgreement) {
      return NextResponse.json(
        { error: "The location owner has not yet signed their agreement. Payment cannot proceed until they do." },
        { status: 400 }
      );
    }
  }

  const siteUrl = getSiteUrl();
  const amountCents = Math.round(Number(agreement.pricing_price) * 100);
  const businessName = (agreement.sales_accounts as unknown as { business_name: string } | null)?.business_name || "Location";

  if (isQuickBooks()) {
    try {
      const invoice = await createInvoice({
        customerEmail: agreement.recipient_email,
        customerName: agreement.recipient_name || businessName,
        lineItems: [
          {
            description: `Vending location placement — ${businessName}`,
            amount: amountCents / 100,
          },
        ],
        memo: `Location Placement Fee — ${businessName}`,
        metadata: {
          type: "agreement_payment",
          agreement_token_id: agreement.id,
          pipeline_item_id: agreement.pipeline_item_id || "",
          step_id: agreement.step_id || "",
        },
      });

      await supabaseAdmin
        .from("agreement_tokens")
        .update({ qb_invoice_id: invoice.Id, payment_provider: "quickbooks", updated_at: new Date().toISOString() })
        .eq("id", agreement.id);

      await sendInvoiceEmail(invoice.Id, agreement.recipient_email);

      const fullInvoice = await getInvoice(invoice.Id);
      if (fullInvoice.InvoiceLink) {
        return NextResponse.json({ url: fullInvoice.InvoiceLink });
      }

      return NextResponse.json({
        url: `${siteUrl}/agreements/${token}?invoice_sent=true`,
        invoiceSent: true,
        invoiceId: invoice.Id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "QuickBooks error";
      console.error("[agreement-checkout] QB error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(stripeKey);

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
            description: `Vending location placement — ${businessName}`,
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

  await supabaseAdmin
    .from("agreement_tokens")
    .update({ stripe_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("id", agreement.id);

  return NextResponse.json({ url: session.url });
}
