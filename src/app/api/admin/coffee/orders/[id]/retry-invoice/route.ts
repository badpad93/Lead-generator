import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { attemptInvoiceForOrder } from "@/lib/coffeeInvoiceRetry";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Admin-only one-shot invoice retry for a coffee order.
 *
 * POST /api/admin/coffee/orders/{id}/retry-invoice
 *
 * Same core function as the scheduled sweep — double-invoice safety
 * lives in attemptInvoiceForOrder, not here. This route just:
 *   - checks admin auth
 *   - refuses the retry if the order already has a qb_invoice_id
 *     (that would be the operator asking to make a THIRD attempt on
 *     an already-invoiced order — not what "retry" means; use the
 *     manual QBO invoice voider if needed)
 *   - bypasses the sweep's cap + gap gates ({ respectCap: false,
 *     respectGap: false }) — that's the entire point of a manual
 *     override
 *   - writes an audit line so the retry is traceable
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: existingRaw } = await supabaseAdmin
    .from("coffee_orders")
    .select("id, status, qb_invoice_id, order_number")
    .eq("id", id)
    .maybeSingle();
  const existing = existingRaw as {
    id: string;
    status: string;
    qb_invoice_id: string | null;
    order_number: string;
  } | null;
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (existing.qb_invoice_id) {
    return NextResponse.json(
      {
        error: "Order already has a QBO invoice",
        qb_invoice_id: existing.qb_invoice_id,
      },
      { status: 409 },
    );
  }
  if (existing.status !== "awaiting_payment") {
    return NextResponse.json(
      {
        error: `Order status is ${existing.status}; retry only supported for awaiting_payment`,
      },
      { status: 409 },
    );
  }

  const result = await attemptInvoiceForOrder(id, {
    respectCap: false,
    respectGap: false,
  });

  console.log(
    `[admin-invoice-retry] order=${id} order_number=${existing.order_number} admin=${adminId} outcome=${result.outcome}`,
  );

  return NextResponse.json({ ok: true, result });
}
