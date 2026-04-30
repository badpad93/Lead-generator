import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  sendReceiptEmail,
  sendLeadDetailsEmail,
  sendPurchaseConfirmationEmail,
  isLeadInfoComplete,
} from "@/lib/email";
import { generateSiteDetailsPdf } from "@/lib/pdf/agreementPdf";
import { sendFullSiteDetailsEmail } from "@/lib/agreementEmail";
import { PricingResult } from "@/lib/pricing/locationPricing";

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[stripe-webhook] STRIPE_SECRET_KEY is not configured");
    throw new Error("Stripe not configured");
  }
  return new Stripe(key);
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not configured");
    throw new Error("Stripe webhook secret not configured");
  }
  return secret;
}

/** POST /api/webhooks/stripe — handle Stripe webhook events */
export async function POST(req: NextRequest) {
  let stripe: Stripe;
  let webhookSecret: string;
  try {
    stripe = getStripeClient();
    webhookSecret = getWebhookSecret();
  } catch {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

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
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Handle agreement payments (location placement)
    if (session.metadata?.type === "agreement_payment") {
      await handleAgreementPayment(session);
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.user_id;
    const requestId = session.metadata?.request_id;
    const agreementId = session.metadata?.agreement_id;
    const buyerEmail = session.customer_details?.email ?? null;

    if (userId && requestId) {
      // Update purchase record with status, payment intent, and buyer email
      const { data: purchase, error: purchaseError } = await supabaseAdmin
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

      if (purchaseError) {
        console.error("Webhook: failed to update purchase record:", purchaseError);
        return NextResponse.json({ error: "Failed to update purchase" }, { status: 500 });
      }

      // Mark the lead as no longer public so it stops appearing in browse results
      const { error: leadUpdateError } = await supabaseAdmin
        .from("vending_requests")
        .update({ is_public: false, status: "matched" })
        .eq("id", requestId);

      if (leadUpdateError) {
        console.error("Webhook: failed to update lead visibility:", leadUpdateError);
      }

      // Link the purchase to the signed agreement
      if (agreementId && purchase) {
        await supabaseAdmin
          .from("signed_agreements")
          .update({ purchase_id: purchase.id })
          .eq("id", agreementId);
      }

      // Fetch the lead details for emails
      const { data: lead } = await supabaseAdmin
        .from("vending_requests")
        .select(
          "title, city, state, location_name, address, zip, description, contact_phone, contact_email, decision_maker_name"
        )
        .eq("id", requestId)
        .single();

      // Send purchase confirmation email immediately
      if (buyerEmail && lead) {
        try {
          await sendPurchaseConfirmationEmail({
            to: buyerEmail,
            leadTitle: lead.title,
            locationName: lead.location_name,
          });
        } catch (e) {
          console.error("Failed to send purchase confirmation email:", e);
        }
      }

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

  // Pipeline payment reconciliation (backup for PandaDoc+Stripe flow)
  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const pipelineItemId = paymentIntent.metadata?.pipeline_item_id;
    const stepId = paymentIntent.metadata?.step_id;

    if (pipelineItemId && stepId) {
      await supabaseAdmin
        .from("pipeline_payments")
        .update({
          status: "completed",
          stripe_payment_intent_id: paymentIntent.id,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("pipeline_item_id", pipelineItemId)
        .eq("step_id", stepId)
        .in("status", ["pending", "created"]);
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

async function handleAgreementPayment(session: Stripe.Checkout.Session) {
  const agreementTokenId = session.metadata?.agreement_token_id;
  const pipelineItemId = session.metadata?.pipeline_item_id;
  const stepId = session.metadata?.step_id;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  if (!agreementTokenId) return;

  // Mark agreement as paid
  await supabaseAdmin
    .from("agreement_tokens")
    .update({
      status: "paid",
      stripe_payment_intent_id: paymentIntentId,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreementTokenId);

  // Mark pipeline payment as completed
  if (pipelineItemId && stepId) {
    await supabaseAdmin
      .from("pipeline_payments")
      .update({
        status: "completed",
        stripe_payment_intent_id: paymentIntentId,
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("pipeline_item_id", pipelineItemId)
      .eq("step_id", stepId)
      .in("status", ["pending", "created"]);

    // Update proposal status
    await supabaseAdmin
      .from("pipeline_items")
      .update({ proposal_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", pipelineItemId);
  }

  // Fetch agreement + location + account for full site details
  const { data: agreement } = await supabaseAdmin
    .from("agreement_tokens")
    .select("*, sales_accounts(business_name, contact_name)")
    .eq("id", agreementTokenId)
    .single();

  if (!agreement) return;

  const { data: location } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", agreement.location_id)
    .single();

  if (!location) return;

  // Fetch signed location agreement via the location's lead
  let locationAgreement: {
    signature_name: string | null;
    signed_at: string | null;
    business_name: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    title_role: string | null;
    status: string;
  } | null = null;

  if (location.sales_lead_id) {
    const { data: la } = await supabaseAdmin
      .from("location_agreements")
      .select("signature_name, signed_at, business_name, contact_name, email, phone, address, title_role, status")
      .eq("lead_id", location.sales_lead_id)
      .eq("status", "signed")
      .maybeSingle();
    locationAgreement = la;
  }

  // Mark location as revealed
  await supabaseAdmin
    .from("locations")
    .update({ is_revealed: true, revealed_at: new Date().toISOString() })
    .eq("id", location.id);

  // Generate and send full site details
  try {
    const pricing: PricingResult = {
      total_score: agreement.pricing_score,
      traffic_score: 0,
      hours_score: 0,
      machine_score: 0,
      tier: agreement.pricing_tier as 1 | 2 | 3 | 4 | 5,
      tier_label: `Tier ${agreement.pricing_tier}`,
      price: Number(agreement.pricing_price),
    };

    const pdfBytes = await generateSiteDetailsPdf({
      businessName: agreement.sales_accounts?.business_name || agreement.recipient_name || "",
      contactName: agreement.recipient_name || "",
      locationName: location.location_name || "",
      address: location.address || "",
      phone: location.phone || "",
      decisionMakerName: location.decision_maker_name || "",
      decisionMakerEmail: location.decision_maker_email || "",
      industry: location.industry || "",
      zip: location.zip || "",
      employeeCount: location.employee_count || 0,
      trafficCount: location.traffic_count || 0,
      machineType: location.machine_type || "",
      machinesRequested: location.machines_requested || 1,
      businessHours: location.business_hours || "",
      pricing,
      generatedAt: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      locationAgreement: locationAgreement ? {
        signatureName: locationAgreement.signature_name || "",
        signedAt: locationAgreement.signed_at || "",
        contactName: locationAgreement.contact_name || "",
        titleRole: locationAgreement.title_role || "",
        email: locationAgreement.email || "",
        phone: locationAgreement.phone || "",
      } : undefined,
    });

    // Upload full details PDF
    const pdfPath = `agreements/${agreement.id}-full-details.pdf`;
    await supabaseAdmin.storage
      .from("sales-documents")
      .upload(pdfPath, Buffer.from(pdfBytes), { contentType: "application/pdf", upsert: true });

    const { data: urlData } = supabaseAdmin.storage.from("sales-documents").getPublicUrl(pdfPath);

    await supabaseAdmin
      .from("agreement_tokens")
      .update({
        full_details_sent_at: new Date().toISOString(),
        full_details_pdf_url: urlData.publicUrl,
      })
      .eq("id", agreementTokenId);

    // Send full site details email
    await sendFullSiteDetailsEmail({
      to: agreement.recipient_email,
      recipientName: agreement.recipient_name || "",
      businessName: agreement.sales_accounts?.business_name || "",
      locationName: location.location_name || "Location",
      pdfBuffer: pdfBytes,
      locationAgreement: locationAgreement ? {
        signatureName: locationAgreement.signature_name || "",
        signedAt: locationAgreement.signed_at || "",
        contactName: locationAgreement.contact_name || "",
        email: locationAgreement.email || "",
        phone: locationAgreement.phone || "",
      } : undefined,
    });
  } catch (e) {
    console.error("[stripe-webhook] Failed to send full site details:", e);
  }
}
