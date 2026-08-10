import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isQuickBooks } from "@/lib/paymentProvider";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";
import { sendCoffeeOrderNotification, sendCoffeeOrderConfirmation } from "@/lib/coffeeEmail";
import { resolveCoffeeProductsPricing } from "@/lib/coffeePricing";
import {
  provisionAccountForGuestCheckout,
  generateGuestToken,
  guestTokenExpiry,
} from "@/lib/auth/provisionalAccount";

/**
 * POST /api/coffee/guest-checkout
 *
 * The "Option B" checkout for unauthenticated visitors: they submit
 * their cart + full billing/shipping info + agreement acknowledgement,
 * we auto-provision a real account behind the scenes, create the order,
 * and email them (a) an invoice/receipt, (b) a magic link to set a
 * password on their new account, (c) a magic link to track the order
 * without ever claiming.
 *
 * Guest cart lives in localStorage on the client and is POSTed here as
 * { items: [{product_id, quantity}, ...] } — we re-resolve pricing and
 * stock server-side, so the client can never dictate the price.
 *
 * If the email already has a NON-provisional profile, we refuse and
 * point them to sign in. We never overwrite a real account without
 * the user proving they own the email.
 */

const REQUIRED_FIELDS: Array<[string, string]> = [
  ["billing_business_name", "Billing business name is required"],
  ["billing_contact_name", "Billing contact name is required"],
  ["billing_email", "Billing email is required"],
  ["billing_phone", "Billing phone is required"],
  ["billing_address", "Billing street address is required"],
  ["billing_city", "Billing city is required"],
  ["billing_state", "Billing state is required"],
  ["billing_zip", "Billing zip is required"],
  ["shipping_business_name", "Shipping business name is required"],
  ["shipping_name", "Shipping contact name is required"],
  ["shipping_address", "Shipping street address is required"],
  ["shipping_city", "Shipping city is required"],
  ["shipping_state", "Shipping state is required"],
  ["shipping_zip", "Shipping zip is required"],
  ["shipping_phone", "Shipping phone is required"],
];

const trim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    for (const [field, message] of REQUIRED_FIELDS) {
      if (!trim(body[field])) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const billingEmail = trim(body.billing_email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      return NextResponse.json({ error: "Billing email is not a valid address" }, { status: 400 });
    }

    // Cart is client-submitted for guests. Server re-resolves price
    // and stock against coffee_products / coffee_pricing_tiers, so the
    // browser can only choose SKU + quantity, never dollar amounts.
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    const cartInput: Array<{ product_id: string; quantity: number }> = [];
    for (const raw of rawItems) {
      const productId = trim((raw as Record<string, unknown>).product_id);
      const quantity = Math.floor(Number((raw as Record<string, unknown>).quantity));
      if (!productId || !Number.isFinite(quantity) || quantity < 1) {
        return NextResponse.json({ error: "Invalid cart line" }, { status: 400 });
      }
      cartInput.push({ product_id: productId, quantity });
    }

    // Look up the products by id to validate SKU / active / stock.
    const productIds = cartInput.map((i) => i.product_id);
    const { data: products, error: productsErr } = await supabaseAdmin
      .from("coffee_products")
      .select("id, name, sku, price, shipping_cost, active, stock_status")
      .in("id", productIds);

    if (productsErr) {
      return NextResponse.json({ error: productsErr.message }, { status: 500 });
    }

    const productById = new Map<string, Record<string, unknown>>();
    for (const p of products ?? []) productById.set(p.id as string, p);

    for (const item of cartInput) {
      const p = productById.get(item.product_id);
      if (!p) {
        return NextResponse.json({ error: "Product not found in cart" }, { status: 400 });
      }
      if (p.active !== true) {
        return NextResponse.json({ error: `Product "${p.name}" is no longer available` }, { status: 400 });
      }
      if (p.stock_status === "out_of_stock") {
        return NextResponse.json({ error: `Product "${p.name}" is out of stock` }, { status: 400 });
      }
    }

    // Marketing consent defaults to true (opt-out per spec — checkbox
    // is pre-checked on the client). Accept explicit false.
    const marketingConsent = body.marketing_consent === false ? false : true;

    // Provision (or reuse) an account for this guest. Any existing
    // non-provisional profile short-circuits to a sign-in nudge — we
    // won't silently attach their order to a stranger's login.
    const account = await provisionAccountForGuestCheckout({
      email: billingEmail,
      business_name: trim(body.billing_business_name),
      contact_name: trim(body.billing_contact_name),
      phone: trim(body.billing_phone),
      address: trim(body.billing_address),
      city: trim(body.billing_city),
      state: trim(body.billing_state),
      zip: trim(body.billing_zip),
      marketing_consent: marketingConsent,
    });

    if ("existing" in account && account.existing) {
      return NextResponse.json(
        {
          error: "An account already exists for this email — please sign in to complete your order.",
          requires_sign_in: true,
        },
        { status: 409 },
      );
    }

    // Coffee wholesale pricing is gated behind a signed supply agreement.
    // Guests get retail pricing until they sign one; the coffee agreement
    // acknowledgement in the checkout form triggers the retail → wholesale
    // upgrade at claim time, not here. Retail is the SAFE default price
    // that never underprices.
    const priced = await resolveCoffeeProductsPricing({
      productIds,
      userId: account.userId,
    });

    const orderNumber = `VC-G-${Date.now()}`;

    const orderItems = cartInput.map((item) => {
      const p = productById.get(item.product_id)!;
      const resolved = priced.get(item.product_id);
      const unitPrice = resolved ? resolved.price : Number(p.price);
      const shippingCost = resolved ? resolved.shipping_cost : Number(p.shipping_cost || 0);
      return {
        product_id: item.product_id,
        product_name: p.name as string,
        product_sku: p.sku as string,
        quantity: item.quantity,
        unit_price: unitPrice,
        shipping_cost: shippingCost,
        line_total: (unitPrice + shippingCost) * item.quantity,
        pricing_tier_id: resolved?.pricing_tier_id || null,
      };
    });

    const subtotal = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    const shippingTotal = orderItems.reduce((sum, i) => sum + i.shipping_cost * i.quantity, 0);
    const total = subtotal + shippingTotal;

    const { data: order, error: orderError } = await supabaseAdmin
      .from("coffee_orders")
      .insert({
        operator_id: account.userId,
        order_number: orderNumber,
        status: "awaiting_payment",
        shipping_business_name: trim(body.shipping_business_name),
        shipping_name: trim(body.shipping_name),
        shipping_address: trim(body.shipping_address),
        shipping_city: trim(body.shipping_city),
        shipping_state: trim(body.shipping_state),
        shipping_zip: trim(body.shipping_zip),
        shipping_phone: trim(body.shipping_phone),
        billing_business_name: trim(body.billing_business_name),
        billing_contact_name: trim(body.billing_contact_name),
        billing_email: billingEmail,
        billing_phone: trim(body.billing_phone),
        billing_address: trim(body.billing_address),
        billing_city: trim(body.billing_city),
        billing_state: trim(body.billing_state),
        billing_zip: trim(body.billing_zip),
        subtotal,
        shipping_estimate: shippingTotal,
        total,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message || "Order create failed" }, { status: 500 });
    }

    const itemsWithOrderId = orderItems.map(({ shipping_cost: _, ...item }) => ({
      ...item,
      order_id: order.id,
    }));

    let { error: itemsError } = await supabaseAdmin
      .from("coffee_order_items")
      .insert(itemsWithOrderId);
    if (itemsError && /pricing_tier_id/.test(itemsError.message || "")) {
      const legacy = itemsWithOrderId.map(({ pricing_tier_id: _tier, ...rest }) => rest);
      const retry = await supabaseAdmin.from("coffee_order_items").insert(legacy);
      itemsError = retry.error;
    }
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Mint the two guest magic-link tokens. password_token lets the
    // customer set a password and claim their account; tracking_token
    // lets them view the order without claiming. Both expire on their
    // own schedules — password link 7 days, tracking link 30 days.
    const passwordToken = generateGuestToken();
    const trackingToken = generateGuestToken();
    const passwordExpiresAt = guestTokenExpiry(7);
    const trackingExpiresAt = guestTokenExpiry(30);

    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("guest_checkout_sessions")
      .insert({
        provisioned_user_id: account.userId,
        email: billingEmail,
        business_name: trim(body.billing_business_name),
        contact_name: trim(body.billing_contact_name),
        phone: trim(body.billing_phone),
        address: trim(body.billing_address),
        city: trim(body.billing_city),
        state: trim(body.billing_state),
        zip: trim(body.billing_zip),
        coffee_order_id: order.id,
        password_token: passwordToken,
        password_token_expires_at: passwordExpiresAt.toISOString(),
        tracking_token: trackingToken,
        tracking_token_expires_at: trackingExpiresAt.toISOString(),
        marketing_consent: marketingConsent,
      })
      .select("id")
      .single();

    if (sessionErr) {
      console.error("[guest-checkout] session insert failed:", sessionErr);
    }

    // Order-placed emails fire immediately so the buyer and fulfillment
    // mailbox both see the order. The buyer confirmation includes both
    // magic links — the buyer can claim their account or just track.
    const siteUrlForEmail = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
    const claimUrl = `${siteUrlForEmail}/coffee/claim/${passwordToken}`;
    const trackingUrlForEmail = `${siteUrlForEmail}/coffee/track/${trackingToken}`;
    try {
      const baseParams = {
        orderNumber,
        operatorName: trim(body.billing_contact_name) || "Customer",
        operatorEmail: billingEmail,
        items: orderItems.map(({ shipping_cost: _, ...i }) => i),
        subtotal,
        shippingEstimate: shippingTotal,
        total,
        shippingBusinessName: trim(body.shipping_business_name),
        shippingName: trim(body.shipping_name),
        shippingAddress: trim(body.shipping_address),
        shippingCity: trim(body.shipping_city),
        shippingState: trim(body.shipping_state),
        shippingZip: trim(body.shipping_zip),
        shippingPhone: trim(body.shipping_phone),
        billingBusinessName: trim(body.billing_business_name),
        billingContactName: trim(body.billing_contact_name),
        billingEmail,
        billingPhone: trim(body.billing_phone),
        billingAddress: trim(body.billing_address),
        billingCity: trim(body.billing_city),
        billingState: trim(body.billing_state),
        billingZip: trim(body.billing_zip),
      };
      await Promise.all([
        sendCoffeeOrderNotification(baseParams),
        sendCoffeeOrderConfirmation({
          ...baseParams,
          claimUrl,
          trackingUrl: trackingUrlForEmail,
        }),
      ]);
    } catch (emailErr) {
      console.error("[guest-checkout] order email failed:", emailErr);
    }

    // Attach the order to a coffee_service workflow so downstream
    // status transitions (processing / shipped / delivered / fulfilled)
    // fire the same customer emails as an authenticated order.
    try {
      const { attachCoffeeOrderToServiceWorkflow } = await import("@/lib/workflows/hooks");
      const attachResult = await attachCoffeeOrderToServiceWorkflow({
        customerId: account.userId,
        coffeeOrderId: order.id,
        orderNumber,
        orderTotal: total,
        orderStatus: order.status,
      });
      if (session?.id && attachResult?.workflowId) {
        await supabaseAdmin
          .from("guest_checkout_sessions")
          .update({ workflow_id: attachResult.workflowId })
          .eq("id", session.id);
      }
    } catch (workflowErr) {
      console.error("[guest-checkout] workflow attach failed:", workflowErr);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

    if (isQuickBooks()) {
      const qbLineItems = orderItems.map((item) => ({
        description: `${item.product_name} (SKU: ${item.product_sku})`,
        amount: item.unit_price,
        quantity: item.quantity,
      }));
      if (shippingTotal > 0) {
        qbLineItems.push({ description: "Shipping", amount: shippingTotal, quantity: 1 });
      }

      const invoice = await createInvoice({
        customerEmail: billingEmail,
        customerName: trim(body.billing_contact_name) || billingEmail,
        customerPhone: trim(body.billing_phone),
        lineItems: qbLineItems,
        memo: `Guest coffee order ${orderNumber}`,
        metadata: {
          type: "coffee_order",
          order_id: order.id,
          order_number: orderNumber,
          user_id: account.userId,
          guest: "true",
        },
      });

      await supabaseAdmin
        .from("coffee_orders")
        .update({ qb_invoice_id: invoice.Id, payment_provider: "quickbooks" })
        .eq("id", order.id);

      await sendInvoiceEmail(invoice.Id, billingEmail);

      const fullInvoice = await getInvoice(invoice.Id);
      const trackingUrl = `${siteUrl}/coffee/track/${trackingToken}`;

      if (fullInvoice.InvoiceLink) {
        return NextResponse.json({
          url: fullInvoice.InvoiceLink,
          tracking_url: trackingUrl,
          order_id: order.id,
        });
      }
      return NextResponse.json({
        url: trackingUrl,
        tracking_url: trackingUrl,
        invoiceSent: true,
        invoiceId: invoice.Id,
        order_id: order.id,
      });
    }

    // Stripe path
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = orderItems.map((item) => ({
      price_data: {
        currency: "usd",
        unit_amount: Math.round(item.unit_price * 100),
        product_data: {
          name: item.product_name,
          description: `SKU: ${item.product_sku}`,
        },
      },
      quantity: item.quantity,
    }));
    if (shippingTotal > 0) {
      stripeLineItems.push({
        price_data: {
          currency: "usd",
          unit_amount: Math.round(shippingTotal * 100),
          product_data: { name: "Shipping" },
        },
        quantity: 1,
      });
    }

    const stripeSession = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: stripeLineItems,
      metadata: {
        type: "coffee_order",
        order_id: order.id,
        order_number: orderNumber,
        user_id: account.userId,
        guest: "true",
      },
      customer_email: billingEmail,
      success_url: `${siteUrl}/coffee/track/${trackingToken}?paid=true`,
      cancel_url: `${siteUrl}/coffee/guest-checkout?canceled=true`,
    });

    await supabaseAdmin
      .from("coffee_orders")
      .update({ stripe_checkout_session_id: stripeSession.id })
      .eq("id", order.id);

    return NextResponse.json({
      url: stripeSession.url,
      tracking_url: `${siteUrl}/coffee/track/${trackingToken}`,
      order_id: order.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[guest-checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
