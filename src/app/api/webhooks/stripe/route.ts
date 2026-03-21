import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  sendReceiptEmail,
  sendLeadDetailsEmail,
  isLeadInfoComplete,
} from "@/lib/email";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

/** POST /api/webhooks/stripe — handle Stripe webhook events */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const requestId = session.metadata?.request_id;
    const buyerEmail = session.customer_details?.email ?? null;

    if (userId && requestId) {
      // Update purchase record with status, payment intent, and buyer email
      const { data: purchase } = await supabaseAdmin
        .from("lead_purchases")
        .update({
          status: "completed",
          buyer_email: buyerEmail,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_checkout_session_id", session.id)
        .select("id, amount_cents, created_at")
        .single();

      // Fetch the lead details for emails
      const { data: lead } = await supabaseAdmin
        .from("vending_requests")
        .select(
          "title, city, state, location_name, address, zip, description, contact_phone, contact_email, decision_maker_name"
        )
        .eq("id", requestId)
        .single();

      if (buyerEmail && lead && purchase) {
        const leadLocation = `${lead.city}, ${lead.state}`;

        // Send receipt email
        try {
          await sendReceiptEmail({
            to: buyerEmail,
            leadTitle: lead.title,
            leadLocation,
            purchaseDate: purchase.created_at,
            amountCents: purchase.amount_cents,
            orderId: purchase.id,
          });
        } catch (e) {
          console.error("Failed to send receipt email:", e);
        }

        // Send lead details email (Case A or B)
        try {
          const complete = isLeadInfoComplete(lead);
          await sendLeadDetailsEmail({
            to: buyerEmail,
            leadTitle: lead.title,
            leadLocation,
            locationName: lead.location_name,
            address: lead.address,
            zip: lead.zip,
            contactPhone: lead.contact_phone,
            contactEmail: lead.contact_email,
            decisionMakerName: lead.decision_maker_name,
            description: lead.description,
            isComplete: complete,
          });
        } catch (e) {
          console.error("Failed to send lead details email:", e);
        }
      }
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    await supabaseAdmin
      .from("lead_purchases")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_checkout_session_id", session.id);
  }

  return NextResponse.json({ received: true });
}
