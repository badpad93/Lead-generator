import { NextRequest, NextResponse } from "next/server";
import { getSalesUser } from "@/lib/salesAuth";
import { sendOrderReceipt, CustomReceiptItem } from "@/lib/sendOrderReceipt";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const paymentType = body.payment_type === "deposit" ? "deposit" : "full";

  // Any of these fields being set flips this into a "custom receipt".
  // The order's tracked receipt_status is NOT touched.
  const hasCustomFields =
    body.custom_amount != null ||
    (Array.isArray(body.custom_items) && body.custom_items.length > 0) ||
    body.custom_notes != null ||
    body.custom_stamp_label ||
    body.custom_subject ||
    body.custom_paid_at ||
    body.custom_recipient_email ||
    (Array.isArray(body.custom_cc) && body.custom_cc.length > 0) ||
    body.reason;

  const result = await sendOrderReceipt({
    orderId: id,
    paymentType,
    paymentMethod: body.payment_method || null,
    paymentReference: body.payment_reference || null,
    userId: user.id,
    custom: hasCustomFields
      ? {
          amount_paid: body.custom_amount != null ? Number(body.custom_amount) : undefined,
          balance_remaining: body.custom_balance_remaining != null ? Number(body.custom_balance_remaining) : undefined,
          items: Array.isArray(body.custom_items)
            ? body.custom_items.map((i: CustomReceiptItem) => ({
                service_name: String(i.service_name || "Item"),
                description: i.description || null,
                quantity: Number(i.quantity) || 1,
                unit_price: Number(i.unit_price) || 0,
                total_price: i.total_price != null ? Number(i.total_price) : undefined,
              }))
            : undefined,
          notes: body.custom_notes ?? undefined,
          stamp_label: body.custom_stamp_label || null,
          subject: body.custom_subject || null,
          paid_at: body.custom_paid_at || undefined,
          recipient_email: body.custom_recipient_email || null,
          cc: Array.isArray(body.custom_cc) ? body.custom_cc : undefined,
          reason: body.reason || null,
        }
      : undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Failed to send receipt" }, { status: 500 });
  }

  return NextResponse.json({ success: true, recipient_email: result.recipientEmail, file_url: result.fileUrl });
}
