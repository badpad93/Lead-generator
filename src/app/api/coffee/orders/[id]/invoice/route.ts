import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCoffeeUser } from "@/lib/coffeeAuth";

/**
 * Customer-facing invoice payment access for a coffee order
 * (marketplace or storefront — both write coffee_orders rows with
 * qb_invoice_id when the QBO invoice goes out).
 *
 * GET  → { pay_url, invoice_number } — QBO's hosted "review and
 *        pay" link (InvoiceLink). Null when QBO doesn't expose a
 *        link for this invoice (online payments off) — the client
 *        falls back to offering a resend of the invoice email,
 *        which always carries QBO's own pay button.
 * POST → resend the invoice email to the order's billing email.
 *
 * Ownership: the order must belong to the signed-in user. No
 * coffee_access_enabled gate — paying for your own order is not a
 * program-membership privilege.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCoffeeUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: order, error } = await supabaseAdmin
    .from("coffee_orders")
    .select("id, operator_id, qb_invoice_id, qb_invoice_number, status")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order || order.operator_id !== user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!order.qb_invoice_id) {
    return NextResponse.json(
      { error: "No invoice on this order yet", code: "NO_INVOICE" },
      { status: 409 },
    );
  }

  try {
    const { getInvoice } = await import("@/lib/quickbooks");
    const invoice = await getInvoice(order.qb_invoice_id, { includeLink: true });
    return NextResponse.json({
      pay_url: invoice.InvoiceLink ?? null,
      invoice_number: order.qb_invoice_number ?? invoice.DocNumber ?? null,
    });
  } catch (e) {
    console.error("[coffee/orders/invoice] getInvoice failed:", e);
    return NextResponse.json(
      { error: "Could not load the invoice from QuickBooks", pay_url: null },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCoffeeUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: order, error } = await supabaseAdmin
    .from("coffee_orders")
    .select("id, operator_id, qb_invoice_id, billing_email")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order || order.operator_id !== user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!order.qb_invoice_id) {
    return NextResponse.json(
      { error: "No invoice on this order yet", code: "NO_INVOICE" },
      { status: 409 },
    );
  }
  const to = (order.billing_email as string | null) || user.email;
  if (!to) {
    return NextResponse.json({ error: "No email on order or profile" }, { status: 400 });
  }

  try {
    const { sendInvoiceEmail } = await import("@/lib/quickbooks");
    await sendInvoiceEmail(order.qb_invoice_id, to);
    return NextResponse.json({ ok: true, sent_to: to });
  } catch (e) {
    console.error("[coffee/orders/invoice] resend failed:", e);
    return NextResponse.json({ error: "Failed to resend the invoice email" }, { status: 502 });
  }
}
