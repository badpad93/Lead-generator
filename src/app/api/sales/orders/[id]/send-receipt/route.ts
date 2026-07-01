import { NextRequest, NextResponse } from "next/server";
import { getSalesUser } from "@/lib/salesAuth";
import { sendOrderReceipt } from "@/lib/sendOrderReceipt";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const paymentType = body.payment_type === "deposit" ? "deposit" : "full";

  const result = await sendOrderReceipt({
    orderId: id,
    paymentType,
    paymentMethod: body.payment_method || null,
    paymentReference: body.payment_reference || null,
    userId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Failed to send receipt" }, { status: 500 });
  }

  return NextResponse.json({ success: true, recipient_email: result.recipientEmail, file_url: result.fileUrl });
}
