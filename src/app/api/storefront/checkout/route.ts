import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveCart,
  PricingResolutionError,
  type ResolvedCart,
} from "@/lib/storefront/pricing";
import { recordOrderCommissions } from "@/lib/storefront/commissions";
import { resolveTenantById } from "@/lib/storefront/tenants";
import {
  findOrCreateResaleExemptCustomer,
  createStorefrontInvoice,
} from "@/lib/storefront/quickbooksStorefront";
import { sendInvoiceEmail } from "@/lib/quickbooks";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Storefront checkout — dedicated route for customers buying through
 * a tenant. Distinct from /api/coffee/checkout (that stays the
 * operator direct-order route) so we can enforce storefront-only
 * rules without regressing the base coffee shop.
 *
 * Flow:
 *   1. Session -> customer profile.
 *   2. Profile MUST be enrolled with this tenant (permanent link).
 *   3. Cart is validated + pricing is resolved server-side.
 *   4. coffee_orders + coffee_order_items are written with the
 *      immutable financial snapshot.
 *   5. Commission ledger rows go in as 'pending'.
 *   6. QBO Invoice is created (resale-exempt) and emailed for
 *      payment — the QB Payments webhook flips commission
 *      pending -> payable when funds settle.
 */
interface CheckoutBody {
  tenant_id: string;
  cart: Array<{ product_id: string; quantity: number }>;
  accepted_proposal_id?: string | null;
  shipping: {
    business_name: string;
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
  };
  billing: {
    business_name: string;
    contact_name: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    zip: string;
  };
  notes?: string | null;
}

export async function POST(req: NextRequest) {
  // Fail-closed kill switch on the money path. 503 is the honest
  // answer: the caller is a real enrolled user who can prove the
  // route usually works. No point pretending.
  if (!(await isStorefrontFlagEnabled("storefront.checkout_enabled"))) {
    return NextResponse.json(
      { error: "Storefront checkout is temporarily unavailable" },
      { status: 503 },
    );
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as CheckoutBody | null;
  if (!body || !body.tenant_id || !Array.isArray(body.cart) || body.cart.length === 0) {
    return NextResponse.json({ error: "tenant_id + cart[] required" }, { status: 400 });
  }
  if (!body.shipping || !body.billing) {
    return NextResponse.json({ error: "shipping + billing required" }, { status: 400 });
  }

  // Profile MUST be permanently linked to this tenant.
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("id, storefront_tenant_id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileRow as {
    id: string;
    storefront_tenant_id: string | null;
    full_name: string;
    email: string;
  } | null;
  if (!profile || profile.storefront_tenant_id !== body.tenant_id) {
    return NextResponse.json(
      { error: "Not enrolled with this storefront" },
      { status: 403 },
    );
  }

  const tenant = await resolveTenantById(body.tenant_id);
  if (!tenant || tenant.status !== "approved") {
    return NextResponse.json({ error: "Storefront unavailable" }, { status: 404 });
  }

  // Server-side pricing.
  let resolved: ResolvedCart;
  try {
    resolved = await resolveCart({
      tenantId: body.tenant_id,
      customerProfileId: userId,
      lines: body.cart.map((l) => ({ product_id: l.product_id, quantity: Number(l.quantity) })),
      acceptedProposalId: body.accepted_proposal_id ?? null,
    });
  } catch (err) {
    if (err instanceof PricingResolutionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[storefront/checkout] resolveCart failed", err);
    return NextResponse.json({ error: "Pricing failed" }, { status: 500 });
  }

  const orderNumber = `SF-${Date.now()}`;
  const trim = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const { data: orderRow, error: orderErr } = await supabaseAdmin
    .from("coffee_orders")
    .insert({
      operator_id: userId,
      storefront_tenant_id: body.tenant_id,
      order_number: orderNumber,
      status: "awaiting_payment",
      shipping_business_name: trim(body.shipping.business_name),
      shipping_name: trim(body.shipping.name),
      shipping_address: trim(body.shipping.address),
      shipping_city: trim(body.shipping.city),
      shipping_state: trim(body.shipping.state),
      shipping_zip: trim(body.shipping.zip),
      shipping_phone: trim(body.shipping.phone),
      billing_business_name: trim(body.billing.business_name),
      billing_contact_name: trim(body.billing.contact_name),
      billing_email: trim(body.billing.email),
      billing_phone: trim(body.billing.phone),
      billing_address: trim(body.billing.address),
      billing_city: trim(body.billing.city),
      billing_state: trim(body.billing.state),
      billing_zip: trim(body.billing.zip),
      subtotal: resolved.totals.tenant_price_total,
      shipping_estimate: 0,
      total: resolved.totals.order_total,
      base_price_total: resolved.totals.base_price_total,
      tenant_price_total: resolved.totals.tenant_price_total,
      commission_total: resolved.totals.commission_total,
      tax_total: resolved.totals.tax_total,
      notes: body.notes ?? null,
    })
    .select("*")
    .single();
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }
  const order = orderRow as { id: string };

  const itemRows = resolved.lines.map((l) => ({
    order_id: order.id,
    product_id: l.product_id,
    product_name: l.product_name,
    product_sku: l.product_sku,
    quantity: l.quantity,
    unit_price: l.tenant_price_per_unit,
    line_total: l.tenant_price_amount,
    pricing_tier_id: l.base_pricing_tier_id,
    storefront_tenant_id: body.tenant_id,
    base_price_per_unit: l.base_price_per_unit,
    tenant_price_per_unit: l.tenant_price_per_unit,
    commission_per_unit: l.commission_per_unit,
    base_price_amount: l.base_price_amount,
    tenant_price_amount: l.tenant_price_amount,
    commission_amount: l.commission_amount,
    tax_amount: l.tax_amount,
  }));
  const { data: insertedItems, error: itemErr } = await supabaseAdmin
    .from("coffee_order_items")
    .insert(itemRows)
    .select("id");
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }
  const itemIds = ((insertedItems ?? []) as Array<{ id: string }>).map((r) => r.id);

  await recordOrderCommissions({
    orderId: order.id,
    tenantId: body.tenant_id,
    customerProfileId: userId,
    resolved,
    orderItemIds: itemIds,
    createdBy: userId,
  });

  // QBO invoice — resale-exempt customer + NON tax code lines.
  // pay_url (QBO's hosted "review and pay" page) goes back to the
  // client so checkout flows straight into payment: cart → checkout
  // → PAY → order processes when the QB webhook sees the payment.
  let qbInvoiceId: string | null = null;
  let payUrl: string | null = null;
  try {
    const qbCustomer = await findOrCreateResaleExemptCustomer({
      displayName: profile.full_name || body.billing.contact_name,
      email: body.billing.email,
      phone: body.billing.phone,
    });
    const invoice = await createStorefrontInvoice({
      qbCustomerId: qbCustomer.Id,
      tenantSlug: tenant.slug,
      orderId: order.id,
      lines: resolved.lines.map((l) => ({
        productId: l.product_id,
        sku: l.product_sku,
        productName: l.product_name,
        quantity: l.quantity,
        unitPrice: l.tenant_price_per_unit,
      })),
      memo: `Order ${orderNumber} via ${tenant.display_name}`,
    });
    qbInvoiceId = invoice.Id;
    await supabaseAdmin
      .from("coffee_orders")
      .update({ qb_invoice_id: invoice.Id, qb_invoice_number: invoice.DocNumber })
      .eq("id", order.id);
    await supabaseAdmin
      .from("storefront_commission_ledger")
      .update({ qb_invoice_id: invoice.Id })
      .eq("coffee_order_id", order.id);
    // Hosted pay link — requires include=invoiceLink on the read.
    // Non-fatal: without it the client falls back to the orders
    // page, where the Pay button offers the same link/email path.
    try {
      const { getInvoice } = await import("@/lib/quickbooks");
      const fullInvoice = await getInvoice(invoice.Id, { includeLink: true });
      payUrl = fullInvoice.InvoiceLink ?? null;
    } catch (linkErr) {
      console.warn("[storefront/checkout] pay-link fetch failed (non-fatal)", linkErr);
    }
    // Fire and forget — never block checkout on the email.
    void sendInvoiceEmail(invoice.Id, body.billing.email).catch((err) =>
      console.warn("[storefront/checkout] invoice email failed", err),
    );
  } catch (err) {
    console.error("[storefront/checkout] QB invoice failed — order retained for retry", err);
  }

  // Dual-branded receipt to the customer, best-effort.
  try {
    const { sendStorefrontOrderReceipt } = await import("@/lib/storefront/emails");
    void sendStorefrontOrderReceipt({
      tenant,
      to: body.billing.email,
      orderNumber,
      lines: resolved.lines.map((l) => ({
        product_name: l.product_name,
        sku: l.product_sku,
        quantity: l.quantity,
        unit_price: l.tenant_price_per_unit,
        line_total: l.tenant_price_amount,
      })),
      total: resolved.totals.order_total,
    });
  } catch (err) {
    console.warn("[storefront/checkout] receipt email failed", err);
  }

  return NextResponse.json({
    order_id: order.id,
    order_number: orderNumber,
    qb_invoice_id: qbInvoiceId,
    pay_url: payUrl,
    totals: resolved.totals,
  });
}
