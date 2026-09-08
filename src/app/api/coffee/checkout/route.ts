import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateTrackingNumber } from "@/lib/orderTracking";
import { getCoffeeUser, hasCoffeePurchaseAccess, forbiddenResponse } from "@/lib/coffeeAuth";
import { resolveTenantById, type StorefrontTenant } from "@/lib/storefront/tenants";
import { isQuickBooks } from "@/lib/paymentProvider";
import { createInvoice, sendInvoiceEmail, getInvoice, QbTimeoutError } from "@/lib/quickbooks";
import { sendCoffeeOrderNotification, sendCoffeeOrderConfirmation } from "@/lib/coffeeEmail";
import { requireExecutedCoffeeSupplyAgreement } from "@/lib/placementAgreements";
import { resolveCoffeeProductsPricing, round2 } from "@/lib/coffeePricing";
import { getCoffeeSettings } from "@/lib/coffeeSettings";

export async function POST(req: NextRequest) {
  try {
    const user = await getCoffeeUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Storefront context: an enrolled customer buys their operator's
    // catalog through THIS route — the storefront is the normal
    // marketplace with tenant branding and per-tenant pricing, not a
    // parallel pipeline. Enrollment is their purchase access.
    let sfTenant: StorefrontTenant | null = null;
    if (user.storefront_tenant_id) {
      sfTenant = await resolveTenantById(user.storefront_tenant_id);
      if (!sfTenant || sfTenant.status !== "approved") {
        return NextResponse.json(
          { error: "This storefront isn't active yet. Please contact the storefront owner.", code: "TENANT_NOT_APPROVED" },
          { status: 403 },
        );
      }
    }
    if (!hasCoffeePurchaseAccess(user)) {
      return forbiddenResponse();
    }

    // Admin-grant override: the admin's coffee_access_enabled flag is the
    // authoritative permission today. The Equipment Loan & Beverage Supply
    // Agreement is prompted on the shop + checkout page as a nudge, but
    // NOT enforced at payment time — that would strand admin-approved
    // operators who haven't signed yet.
    //
    // Flip the env var COFFEE_AGREEMENT_ENFORCED=true to turn the hard
    // gate back on once every active operator has signed. The full guard
    // infrastructure (template, sign flow, countersign queue) is already
    // wired — this flag is the only switch.
    if (!sfTenant && process.env.COFFEE_AGREEMENT_ENFORCED === "true") {
      const agreementBlock = await requireExecutedCoffeeSupplyAgreement(user.id);
      if (agreementBlock) {
        return NextResponse.json(
          { error: agreementBlock, sign_url: "/coffee/agreement" },
          { status: 403 },
        );
      }
    }

    const body = await req.json();

    // Business billing address AND shipping address are mandatory for every
    // new order. Fail fast before touching the cart/QB so callers see a
    // clear error and no ghost order/invoice gets created.
    const trim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
    const requiredFields: Array<[string, string]> = [
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
    for (const [field, message] of requiredFields) {
      if (!trim(body[field])) return NextResponse.json({ error: message }, { status: 400 });
    }
    const billingEmail = trim(body.billing_email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
      return NextResponse.json({ error: "Billing email is not a valid address" }, { status: 400 });
    }

    const { data: cartItems, error: cartError } = await supabaseAdmin
      .from("coffee_cart_items")
      .select("*, coffee_products(id, name, sku, price, shipping_cost, active, stock_status)")
      .eq("user_id", user.id);

    if (cartError) {
      return NextResponse.json({ error: cartError.message }, { status: 500 });
    }

    if (!cartItems || cartItems.length === 0) {
      return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    }

    // Storefront buyers: products the owner hid don't exist for this
    // tenant — refuse checkout if one is still in the cart (it could
    // have been added before the owner hid it) so nothing hidden ever
    // gets billed.
    let sfHidden: Set<string> = new Set();
    if (sfTenant) {
      const { getHiddenProductIds } = await import("@/lib/storefront/visibility");
      sfHidden = await getHiddenProductIds(sfTenant.id);
    }

    const validItems = cartItems.filter((item: Record<string, unknown>) => {
      const product = item.coffee_products as Record<string, unknown>;
      return product.active === true && product.stock_status !== "out_of_stock";
    });

    if (sfTenant) {
      const hiddenInCart = validItems.find((item: Record<string, unknown>) =>
        sfHidden.has((item.coffee_products as Record<string, unknown>).id as string),
      );
      if (hiddenInCart) {
        const name = (hiddenInCart.coffee_products as Record<string, unknown>).name;
        return NextResponse.json(
          {
            error: `${String(name ?? "An item")} is no longer available in this storefront — remove it from your cart to continue.`,
            code: "PRODUCT_NOT_FOUND",
          },
          { status: 400 },
        );
      }
    }

    if (validItems.length === 0) {
      return NextResponse.json({ error: "All items in your cart are unavailable" }, { status: 400 });
    }

    // Resolve every line's unit price against the operator's coffee
    // pricing tier — the joined coffee_products.price is only used as
    // a bootstrap fallback. Snapshot the resolved pricing_tier_id on
    // the order line so historical orders stay correct after admin
    // edits tier prices later.
    const productIds = validItems.map((i: Record<string, unknown>) => (i.coffee_products as Record<string, unknown>).id as string);
    const priced = await resolveCoffeeProductsPricing({
      productIds,
      userId: user.id,
      storefront: sfTenant
        ? { tenantId: sfTenant.id, customerProfileId: user.id }
        : null,
    });

    // Storefront lines carry per-entry error flags instead of throwing
    // (NO_BASE_PRICE / PRICE_BELOW_BASE). Refuse the whole checkout on
    // any flagged line — commission math can't run and nothing partial
    // may reach the ledger. The client maps these codes to actionable
    // copy ("pricing isn't set up yet — contact the storefront owner").
    if (sfTenant) {
      for (const pid of productIds) {
        const err = priced.get(pid)?.storefront?.error;
        if (err) {
          return NextResponse.json(
            {
              error:
                err === "PRICE_BELOW_BASE"
                  ? "A configured price is below the storefront's base price — checkout is blocked until the owner fixes pricing."
                  : "This storefront's pricing isn't set up for an item in your cart.",
              code: err,
            },
            { status: 400 },
          );
        }
      }
    }

    const orderNumber = `VC-${Date.now()}`;

    const orderItems = validItems.map((item: Record<string, unknown>) => {
      const product = item.coffee_products as Record<string, unknown>;
      const productId = product.id as string;
      const resolved = priced.get(productId);
      const unitPrice = resolved ? resolved.price : Number(product.price);
      const shippingCost = resolved ? resolved.shipping_cost : Number(product.shipping_cost || 0);
      const quantity = Number(item.quantity);
      return {
        product_id: productId,
        product_name: product.name as string,
        product_sku: product.sku as string,
        quantity,
        unit_price: unitPrice,
        shipping_cost: shippingCost,
        line_total: (unitPrice + shippingCost) * quantity,
        pricing_tier_id: resolved?.pricing_tier_id || null,
        // Present only for storefront buyers — the commission
        // snapshot the ledger and payout console run on.
        sf: resolved?.storefront ?? null,
      };
    });

    // Storefront ledger math: per-line base/sell/commission amounts,
    // immutable at order time. sfLines is index-aligned with
    // orderItems (and therefore with the inserted item rows).
    const sfLines = sfTenant
      ? orderItems.map((i) => ({
          base_price_amount: round2((i.sf?.base_price ?? 0) * i.quantity),
          tenant_price_amount: round2(i.unit_price * i.quantity),
          commission_amount: round2((i.sf?.commission ?? 0) * i.quantity),
          quantity: i.quantity,
        }))
      : [];
    const sfTotals = sfTenant
      ? {
          base_price_total: round2(sfLines.reduce((a, l) => a + l.base_price_amount, 0)),
          tenant_price_total: round2(sfLines.reduce((a, l) => a + l.tenant_price_amount, 0)),
          commission_total: round2(sfLines.reduce((a, l) => a + l.commission_amount, 0)),
          tax_total: 0,
        }
      : null;

    const subtotal = orderItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
    const shippingTotal = orderItems.reduce((sum, i) => sum + i.shipping_cost * i.quantity, 0);
    const total = subtotal + shippingTotal;

    // Enforce the org-wide minimum-order gate BEFORE we insert the
    // order row or fire the QB/Stripe request. Shipping is excluded
    // from the check — the minimum is about the operator committing
    // to actual product volume, not an inflated shipping line.
    // Storefront customers are exempt from the operator minimum —
    // parity with the retired storefront checkout, which never had
    // one. Their order sizes are the tenant's business, not ours.
    const settings = await getCoffeeSettings();
    if (!sfTenant && settings.minimum_order_enforced && subtotal * 100 < settings.minimum_order_cents) {
      const minDollars = (settings.minimum_order_cents / 100).toFixed(2);
      const shortDollars = ((settings.minimum_order_cents / 100) - subtotal).toFixed(2);
      return NextResponse.json(
        {
          error: `Coffee orders have a $${minDollars} minimum. Add $${shortDollars} more to your cart to check out.`,
          minimum_order_cents: settings.minimum_order_cents,
          subtotal_cents: Math.round(subtotal * 100),
        },
        { status: 400 },
      );
    }

    // Retry idempotency: if the user already has an awaiting_payment
    // order with no qb_invoice_id (i.e. the previous submit reached
    // the DB but the QBO leg failed or timed out), reuse it instead
    // of inserting a new one. Prevents the "smash the button 5 times
    // during an Intuit outage → 5 duplicate orders + 5 email pairs"
    // failure mode that surfaced in the Sep 1 outage.
    // The reuse window is short (10 minutes) so a truly abandoned
    // order the user came back to a day later isn't recycled without
    // fresh shipping/billing input.
    const REUSE_WINDOW_MS = 10 * 60 * 1000;
    const reuseCutoff = new Date(Date.now() - REUSE_WINDOW_MS).toISOString();
    const { data: reusable } = await supabaseAdmin
      .from("coffee_orders")
      .select("*")
      .eq("operator_id", user.id)
      .eq("status", "awaiting_payment")
      .is("qb_invoice_id", null)
      .gte("created_at", reuseCutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let order: Record<string, unknown> | null = null;
    let reused = false;

    if (reusable) {
      // Refresh the addresses + totals on the reused row so a user
      // who edited their cart or address between attempts gets the
      // current values persisted before we mint the invoice.
      const { data: refreshed, error: refreshErr } = await supabaseAdmin
        .from("coffee_orders")
        .update({
          shipping_business_name: trim(body.shipping_business_name),
          shipping_name: trim(body.shipping_name),
          shipping_address: trim(body.shipping_address),
          shipping_city: trim(body.shipping_city),
          shipping_state: trim(body.shipping_state),
          shipping_zip: trim(body.shipping_zip),
          shipping_phone: trim(body.shipping_phone),
          billing_business_name: trim(body.billing_business_name),
          billing_contact_name: trim(body.billing_contact_name),
          billing_email: trim(body.billing_email),
          billing_phone: trim(body.billing_phone),
          billing_address: trim(body.billing_address),
          billing_city: trim(body.billing_city),
          billing_state: trim(body.billing_state),
          billing_zip: trim(body.billing_zip),
          subtotal,
          shipping_estimate: shippingTotal,
          total,
          notes: body.notes ?? null,
          ...(sfTenant && sfTotals ? { storefront_tenant_id: sfTenant.id, ...sfTotals } : {}),
        })
        .eq("id", (reusable as { id: string }).id)
        .select("*")
        .single();
      if (refreshErr) {
        return NextResponse.json({ error: refreshErr.message }, { status: 500 });
      }
      order = refreshed as Record<string, unknown>;
      reused = true;
      // Wipe old line items so the retry writes fresh ones matching
      // the current cart.
      await supabaseAdmin
        .from("coffee_order_items")
        .delete()
        .eq("order_id", (order as { id: string }).id);
      // Storefront retry: the pending ledger rows reference the item
      // rows just deleted, and re-recording against fresh item ids
      // would mint duplicate idempotency keys — wipe pending rows so
      // the re-record below is the only ledger truth for this order.
      if (sfTenant) {
        await supabaseAdmin
          .from("storefront_commission_ledger")
          .delete()
          .eq("coffee_order_id", (order as { id: string }).id)
          .eq("status", "pending");
      }
    } else {
      const { data: inserted, error: orderError } = await supabaseAdmin
        .from("coffee_orders")
        .insert({
          operator_id: user.id,
          order_number: orderNumber,
          tracking_number: generateTrackingNumber(),
          status: "awaiting_payment",
          // Ship-to
          shipping_business_name: trim(body.shipping_business_name),
          shipping_name: trim(body.shipping_name),
          shipping_address: trim(body.shipping_address),
          shipping_city: trim(body.shipping_city),
          shipping_state: trim(body.shipping_state),
          shipping_zip: trim(body.shipping_zip),
          shipping_phone: trim(body.shipping_phone),
          // Bill-to
          billing_business_name: trim(body.billing_business_name),
          billing_contact_name: trim(body.billing_contact_name),
          billing_email: trim(body.billing_email),
          billing_phone: trim(body.billing_phone),
          billing_address: trim(body.billing_address),
          billing_city: trim(body.billing_city),
          billing_state: trim(body.billing_state),
          billing_zip: trim(body.billing_zip),
          subtotal,
          shipping_estimate: shippingTotal,
          total,
          notes: body.notes ?? null,
          ...(sfTenant && sfTotals ? { storefront_tenant_id: sfTenant.id, ...sfTotals } : {}),
        })
        .select("*")
        .single();
      if (orderError) {
        return NextResponse.json({ error: orderError.message }, { status: 500 });
      }
      order = inserted as Record<string, unknown>;
    }

    // Downstream code expects the same variable name.
    const orderRow = order as { id: string; status: string; order_number?: string };
    // Keep the caller-visible orderNumber in sync with the reused row.
    const effectiveOrderNumber = (orderRow.order_number as string) ?? orderNumber;

    const itemsWithOrderId = orderItems.map(({ shipping_cost: _, sf, ...item }, idx) => ({
      ...item,
      order_id: orderRow.id,
      ...(sfTenant
        ? {
            storefront_tenant_id: sfTenant.id,
            base_price_per_unit: sf?.base_price ?? 0,
            tenant_price_per_unit: item.unit_price,
            commission_per_unit: sf?.commission ?? 0,
            base_price_amount: sfLines[idx].base_price_amount,
            tenant_price_amount: sfLines[idx].tenant_price_amount,
            commission_amount: sfLines[idx].commission_amount,
            tax_amount: 0,
          }
        : {}),
    }));

    // Insert order lines. pricing_tier_id was added in migration 118 —
    // if a customer hasn't applied it yet, PostgREST returns "Could not
    // find the pricing_tier_id column". Fall back to inserting without
    // the tier snapshot so orders still commit. Once migration 118 is
    // applied the first attempt succeeds and the retry never runs.
    // Returned ids are index-aligned with the input rows — the
    // commission recorder below depends on that ordering.
    let { data: insertedItems, error: itemsError } = await supabaseAdmin
      .from("coffee_order_items")
      .insert(itemsWithOrderId)
      .select("id");
    if (itemsError && /pricing_tier_id/.test(itemsError.message || "")) {
      const legacy = itemsWithOrderId.map(({ pricing_tier_id: _tier, ...rest }) => rest);
      const retry = await supabaseAdmin.from("coffee_order_items").insert(legacy).select("id");
      itemsError = retry.error;
      insertedItems = retry.data;
    }
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Storefront: write the commission ledger rows (status 'pending';
    // the QB payments webhook flips them payable when funds settle).
    // This is money-path critical — a failure here fails the checkout
    // so the retry-idempotency block can redo the whole order cleanly.
    if (sfTenant && sfTotals) {
      const { recordOrderCommissions } = await import("@/lib/storefront/commissions");
      await recordOrderCommissions({
        orderId: orderRow.id,
        tenantId: sfTenant.id,
        customerProfileId: user.id,
        resolved: { lines: sfLines },
        orderItemIds: ((insertedItems ?? []) as Array<{ id: string }>).map((r) => r.id),
        createdBy: user.id,
      });
    }

    // Attach this order to the customer's coffee_service workflow as a
    // fulfillment sub-item. Best-effort — never blocks checkout. If the
    // customer has no coffee_service workflow yet (legacy customers who
    // signed before this system launched), the backfill tool can create
    // one.
    try {
      const { attachCoffeeOrderToServiceWorkflow } = await import("@/lib/workflows/hooks");
      await attachCoffeeOrderToServiceWorkflow({
        customerId: user.id,
        coffeeOrderId: orderRow.id,
        orderNumber: effectiveOrderNumber,
        orderTotal: total,
        orderStatus: orderRow.status,
      });
    } catch (workflowErr) {
      console.error("[coffee-checkout] workflow attach failed:", workflowErr);
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

    // Cart-clear + "order placed" emails deliberately run AFTER the
    // payment session or invoice succeeds. Previously they fired
    // immediately after the DB inserts, so an Intuit outage that
    // hung createInvoice for 5 minutes still wiped the user's cart
    // and emailed them + fulfillment for every retry. See helper
    // below.
    const emailParams = {
      orderNumber: effectiveOrderNumber,
      trackingNumber: (orderRow as { tracking_number?: string | null }).tracking_number ?? null,
      operatorName: user.full_name || "Operator",
      operatorEmail: user.email || "",
      items: orderItems.map(({ shipping_cost: _, sf: _sf, ...i }) => i),
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
      billingEmail: trim(body.billing_email),
      billingPhone: trim(body.billing_phone),
      billingAddress: trim(body.billing_address),
      billingCity: trim(body.billing_city),
      billingState: trim(body.billing_state),
      billingZip: trim(body.billing_zip),
    };
    // Capture into a const so the nested closure below doesn't lose
    // the earlier narrow-to-not-null on `user`.
    const userIdForCart = user.id;
    const receiptTenant = sfTenant;
    async function finalizeSideEffects() {
      await supabaseAdmin
        .from("coffee_cart_items")
        .delete()
        .eq("user_id", userIdForCart);
      try {
        // Storefront buyers get the dual-branded tenant receipt in
        // place of the operator confirmation; the internal fulfillment
        // notification goes out either way.
        const confirmation = receiptTenant
          ? import("@/lib/storefront/emails").then(({ sendStorefrontOrderReceipt }) =>
              sendStorefrontOrderReceipt({
                tenant: receiptTenant,
                to: emailParams.billingEmail,
                orderNumber: emailParams.orderNumber,
                trackingNumber: emailParams.trackingNumber,
                lines: emailParams.items.map((i) => ({
                  product_name: i.product_name,
                  sku: i.product_sku,
                  quantity: i.quantity,
                  unit_price: i.unit_price,
                  line_total: i.line_total,
                })),
                total: emailParams.total,
              }),
            )
          : sendCoffeeOrderConfirmation(emailParams);
        await Promise.all([sendCoffeeOrderNotification(emailParams), confirmation]);
      } catch {
        // Email failures should not block the order
      }
    }

    if (isQuickBooks()) {
      const qbLineItems = orderItems.map((item) => ({
        description: `${item.product_name} (SKU: ${item.product_sku})`,
        amount: item.unit_price,
        quantity: item.quantity,
      }));

      if (shippingTotal > 0) {
        qbLineItems.push({ description: "Shipping", amount: shippingTotal, quantity: 1 });
      }

      // Storefront buyers invoice as RESALE-EXEMPT QB customers.
      // createInvoice finds customers by email, so pre-creating the
      // exempt customer here means the normal invoice path below —
      // timeout guard, deterministic DocNumber, recovery sweep and
      // all — lands on it. Best-effort: if Intuit hiccups on this
      // call, the invoice still goes out to a standard customer.
      if (sfTenant) {
        try {
          const { findOrCreateResaleExemptCustomer } = await import(
            "@/lib/storefront/quickbooksStorefront"
          );
          await findOrCreateResaleExemptCustomer({
            displayName: user.full_name || trim(body.billing_contact_name),
            email: user.email || billingEmail,
            phone: trim(body.billing_phone),
          });
        } catch (exemptErr) {
          console.warn(
            "[coffee-checkout] resale-exempt customer pre-create failed (non-fatal):",
            exemptErr,
          );
        }
      }

      let invoice: Awaited<ReturnType<typeof createInvoice>>;
      try {
        invoice = await createInvoice({
          customerEmail: user.email || "",
          customerName: user.full_name || user.email || "Customer",
          lineItems: qbLineItems,
          memo: sfTenant
            ? `Coffee order ${effectiveOrderNumber} via ${sfTenant.display_name}`
            : `Coffee order ${effectiveOrderNumber}`,
          metadata: {
            type: "coffee_order",
            order_id: orderRow.id,
            order_number: effectiveOrderNumber,
            user_id: user.id,
          },
          // Deterministic DocNumber so the invoice-retry sweep can
          // recover an orphaned invoice (one Intuit created before
          // our request timed out) via findInvoiceByDocNumber and
          // avoid a double-bill.
          docNumber: effectiveOrderNumber,
        });
      } catch (err) {
        if (err instanceof QbTimeoutError) {
          // Intuit is slow/down. The order row exists in
          // awaiting_payment with no qb_invoice_id — the retry
          // idempotency block above will pick it up cleanly on the
          // customer's next attempt (or admin retry), and the cart
          // is still intact for them. Don't send "order placed"
          // emails since there's no invoice link to send.
          console.warn(
            `[coffee-checkout] QBO createInvoice timed out for order ${orderRow.id}; returning invoice_pending. Reused=${reused}. Cause:`,
            err.message,
          );
          return NextResponse.json({
            url: `${siteUrl}/coffee/orders/${orderRow.id}?invoice_pending=true`,
            invoicePending: true,
            orderId: orderRow.id,
            orderNumber: effectiveOrderNumber,
            message:
              "QuickBooks is slow right now — your order is saved. We'll email you the invoice as soon as it clears.",
          });
        }
        throw err;
      }

      await supabaseAdmin
        .from("coffee_orders")
        .update({ qb_invoice_id: invoice.Id, payment_provider: "quickbooks" })
        .eq("id", orderRow.id);

      // Link the ledger rows to the invoice so the payments webhook
      // can flip pending → payable when this invoice settles.
      if (sfTenant) {
        await supabaseAdmin
          .from("storefront_commission_ledger")
          .update({ qb_invoice_id: invoice.Id })
          .eq("coffee_order_id", orderRow.id);
      }

      // sendInvoiceEmail + getInvoice also touch QBO; guard both so
      // a late-stage Intuit hiccup doesn't leave the customer without
      // the pending page and doesn't strand the function.
      try {
        await sendInvoiceEmail(invoice.Id, user.email || undefined);
      } catch (mailErr) {
        console.warn("[coffee-checkout] QB invoice email failed (non-fatal):", mailErr);
      }

      let invoiceUrl: string | null = null;
      try {
        // include=invoiceLink is REQUIRED for QBO to return the
        // hosted "review and pay" URL — without it InvoiceLink is
        // absent and every customer fell through to the
        // invoice_sent page with no way to pay at checkout.
        const fullInvoice = await getInvoice(invoice.Id, { includeLink: true });
        if (fullInvoice.InvoiceLink) invoiceUrl = fullInvoice.InvoiceLink;
      } catch (getErr) {
        console.warn("[coffee-checkout] QB getInvoice failed (non-fatal):", getErr);
      }

      await finalizeSideEffects();

      return NextResponse.json({
        url: invoiceUrl ?? `${siteUrl}/coffee/orders/${orderRow.id}?invoice_sent=true`,
        invoiceSent: true,
        invoiceId: invoice.Id,
      });
    }

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
          product_data: {
            name: "Shipping",
          },
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: stripeLineItems,
      metadata: {
        type: "coffee_order",
        order_id: orderRow.id,
        order_number: effectiveOrderNumber,
        user_id: user.id,
      },
      customer_email: user.email || undefined,
      success_url: `${siteUrl}/coffee/orders/${orderRow.id}?paid=true`,
      cancel_url: `${siteUrl}/coffee/checkout?canceled=true`,
    });

    await supabaseAdmin
      .from("coffee_orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", orderRow.id);

    await finalizeSideEffects();

    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
