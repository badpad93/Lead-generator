import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { calculateFees, FEE_EXEMPT_ROLES } from "@/lib/checkoutFees";
import { isQuickBooks } from "@/lib/paymentProvider";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";
import {
  provisionAccountForGuestCheckout,
  generateGuestToken,
  guestTokenExpiry,
} from "@/lib/auth/provisionalAccount";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: listing } = await supabaseAdmin
    .from("machine_listings")
    .select("id, title, buy_now_enabled, buy_now_price, asking_price, delivery_fee_cents, includes_delivery, status")
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

  const deliveryFeeCents = listing.includes_delivery && listing.delivery_fee_cents ? listing.delivery_fee_cents : 0;
  const subtotalCents = priceInCents + deliveryFeeCents;

  // Auto-provision a real account for anonymous buyers so they can shop
  // without signing up first. Every purchase-record + workflow field
  // downstream needs a userId — the provisioned profile keeps the same
  // shape, so no schema changes and no downstream branches. When an
  // authenticated user is present we skip provisioning entirely.
  //
  // Existing accounts short-circuit with a "please sign in" hint — we
  // never silently attach a new order to a stranger's real login.
  let userId = await getUserIdFromRequest(req);
  let provisionedUserId: string | null = null;
  if (!userId) {
    try {
      const provisionResult = await provisionAccountForGuestCheckout({
        email: body.email,
        business_name: body.business_name || body.full_name || body.email,
        contact_name: body.full_name || "",
        phone: body.phone,
        address: body.business_address || "",
        city: body.business_city ?? null,
        state: body.business_state ?? null,
        zip: body.business_zip ?? null,
        marketing_consent: body.marketing_consent === false ? false : true,
      });
      if ("existing" in provisionResult && provisionResult.existing) {
        return NextResponse.json(
          {
            error: "An account already exists for this email. Please sign in and try again.",
            requires_sign_in: true,
          },
          { status: 409 },
        );
      }
      userId = provisionResult.userId;
      provisionedUserId = provisionResult.userId;
    } catch (provErr) {
      const msg = provErr instanceof Error ? provErr.message : "Failed to create account";
      console.error("[machine-checkout] guest provision failed:", msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Check if buyer is exempt from fees (sales team / admin)
  let feesExempt = false;
  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role && FEE_EXEMPT_ROLES.includes(profile.role)) feesExempt = true;

  const fees = feesExempt ? { brokerFeeCents: 0, processingFeeCents: 0, totalFeeCents: 0 } : calculateFees(subtotalCents);
  const totalCents = subtotalCents + fees.totalFeeCents;

  const { data: purchase, error: purchaseErr } = await supabaseAdmin
    .from("machine_listing_purchases")
    .insert({
      machine_listing_id: listing.id,
      amount_cents: totalCents,
      full_name: body.full_name,
      email: body.email,
      phone: body.phone,
      buyer_type: body.buyer_type || null,
      business_name: body.business_name || null,
      business_address: body.business_address || null,
      business_city: body.business_city || null,
      business_state: body.business_state || null,
      business_zip: body.business_zip || null,
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
    console.error("[checkout] Failed to create purchase record:", purchaseErr.message);
    return NextResponse.json({ error: `Failed to create purchase record: ${purchaseErr.message}` }, { status: 500 });
  }

  // Spawn ai_machine_fulfillment workflow. Starts in pending_payment;
  // the payment webhook advances payment_confirmed later. Best-effort —
  // never blocks checkout.
  let workflowId: string | null = null;
  try {
    const { spawnFromMachineListingPurchase } = await import("@/lib/workflows/hooks");
    const wf = await spawnFromMachineListingPurchase(purchase.id, {
      customerId: userId,
      listingId: listing.id,
      machineTitle: listing.title,
    });
    workflowId = wf?.id ?? null;
  } catch (workflowErr) {
    console.error("[machine-checkout] workflow spawn failed:", workflowErr);
  }

  const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  // Guest-only: mint the claim + tracking magic links, save a session
  // row so the buyer can find their way back after payment.
  let trackingUrl: string | null = null;
  if (provisionedUserId) {
    try {
      const passwordToken = generateGuestToken();
      const trackingToken = generateGuestToken();
      await supabaseAdmin.from("guest_checkout_sessions").insert({
        provisioned_user_id: provisionedUserId,
        email: body.email,
        business_name: body.business_name || null,
        contact_name: body.full_name || null,
        phone: body.phone || null,
        address: body.business_address || null,
        city: body.business_city || null,
        state: body.business_state || null,
        zip: body.business_zip || null,
        workflow_id: workflowId,
        password_token: passwordToken,
        password_token_expires_at: guestTokenExpiry(7).toISOString(),
        tracking_token: trackingToken,
        tracking_token_expires_at: guestTokenExpiry(30).toISOString(),
        marketing_consent: body.marketing_consent === false ? false : true,
      });
      trackingUrl = `${origin}/coffee/track/${trackingToken}`;
      // Fire a quick confirmation email that includes the claim link so
      // the buyer can set a password and reach their order later. The
      // main purchase-confirmation flow runs on the payment webhook, so
      // this "we captured your info" nudge fills the pre-payment gap.
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const claimUrl = `${origin}/coffee/claim/${passwordToken}`;
        await resend.emails.send({
          from: process.env.FROM_EMAIL || "receipts@bytebitevending.com",
          to: body.email,
          subject: `Your Vending Connector account — complete payment to secure ${listing.title}`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
              <h2 style="color:#16a34a;">Thanks, ${body.full_name || "there"}!</h2>
              <p>We've reserved <strong>${listing.title}</strong> and created a free Vending Connector account for you.</p>
              <p>Set a password below so you can sign in later to track this order, view your invoice, and reorder supplies:</p>
              <p><a href="${claimUrl}" style="display:inline-block; background:#16a34a; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none; font-weight:600;">Set my password</a></p>
              <p style="font-size:12px; color:#6b7280;">Link expires in 7 days. Or track your order without an account: <a href="${trackingUrl}" style="color:#16a34a;">view order status</a></p>
            </div>
          `,
        });
      } catch (mailErr) {
        console.error("[machine-checkout] guest claim email failed:", mailErr);
      }
    } catch (sessionErr) {
      console.error("[machine-checkout] guest session insert failed:", sessionErr);
    }
  }

  if (isQuickBooks()) {
    try {
      const lineItems = [
        { description: `Vending machine purchase — ${listing.title}`, amount: priceInCents / 100 },
      ];
      if (deliveryFeeCents > 0) {
        lineItems.push({ description: `Delivery for ${listing.title}`, amount: deliveryFeeCents / 100 });
      }
      if (fees.brokerFeeCents > 0) {
        lineItems.push({ description: "Broker Fee (5%)", amount: fees.brokerFeeCents / 100 });
      }
      if (fees.processingFeeCents > 0) {
        lineItems.push({ description: "Processing Fee (2.9%)", amount: fees.processingFeeCents / 100 });
      }

      const invoice = await createInvoice({
        customerEmail: body.email,
        customerName: body.full_name,
        customerPhone: body.phone,
        lineItems,
        memo: `Vending machine purchase — ${listing.title}`,
        metadata: { type: "machine_purchase", machine_listing_id: listing.id, purchase_id: purchase.id },
      });

      await supabaseAdmin
        .from("machine_listing_purchases")
        .update({ qb_invoice_id: invoice.Id, payment_provider: "quickbooks" })
        .eq("id", purchase.id);

      await sendInvoiceEmail(invoice.Id, body.email);

      const fullInvoice = await getInvoice(invoice.Id);
      if (fullInvoice.InvoiceLink) {
        return NextResponse.json({ url: fullInvoice.InvoiceLink });
      }

      return NextResponse.json({
        url: `${origin}/machines-for-sale/${listing.id}?invoice_sent=true`,
        invoiceSent: true,
        invoiceId: invoice.Id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "QuickBooks error";
      console.error("[machine-checkout] QB error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return NextResponse.json({ error: "Payment not configured" }, { status: 500 });

  const stripe = new Stripe(stripeKey);

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
      ...(deliveryFeeCents > 0
        ? [
            {
              price_data: {
                currency: "usd" as const,
                product_data: {
                  name: "Delivery Fee",
                  description: `Delivery for ${listing.title}`,
                },
                unit_amount: deliveryFeeCents,
              },
              quantity: 1,
            },
          ]
        : []),
      ...(fees.brokerFeeCents > 0
        ? [
            {
              price_data: {
                currency: "usd" as const,
                product_data: {
                  name: "Broker Fee (5%)",
                  description: "Vending Connector marketplace broker fee",
                },
                unit_amount: fees.brokerFeeCents,
              },
              quantity: 1,
            },
          ]
        : []),
      ...(fees.processingFeeCents > 0
        ? [
            {
              price_data: {
                currency: "usd" as const,
                product_data: {
                  name: "Processing Fee (2.9%)",
                  description: "Payment processing fee",
                },
                unit_amount: fees.processingFeeCents,
              },
              quantity: 1,
            },
          ]
        : []),
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
