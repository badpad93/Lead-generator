import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyWebhookSignature, captureOrder } from "@/lib/paypal";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (webhookId) {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const valid = await verifyWebhookSignature(webhookId, headers, rawBody);
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }
  }

  let event: { event_type: string; resource: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const eventType = event.event_type;
  const resource = event.resource;

  if (
    eventType === "CHECKOUT.ORDER.APPROVED" ||
    eventType === "PAYMENT.CAPTURE.COMPLETED"
  ) {
    const orderId =
      (resource.id as string) ||
      (resource.supplementary_data as Record<string, unknown>)?.related_ids
        ? ((
            (resource.supplementary_data as Record<string, Record<string, string>>)
              ?.related_ids
          )?.order_id as string)
        : null;

    if (!orderId) {
      return NextResponse.json({ ok: true });
    }

    const { data: payment } = await supabaseAdmin
      .from("pipeline_payments")
      .select("*")
      .eq("external_order_id", orderId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ ok: true });
    }

    if (eventType === "CHECKOUT.ORDER.APPROVED") {
      // Auto-capture the payment
      try {
        const captured = await captureOrder(orderId);
        const captureId =
          (
            captured as unknown as {
              purchase_units: {
                payments: { captures: { id: string }[] };
              }[];
            }
          ).purchase_units?.[0]?.payments?.captures?.[0]?.id || null;

        await supabaseAdmin
          .from("pipeline_payments")
          .update({
            status: "completed",
            external_payment_id: captureId,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
      } catch {
        await supabaseAdmin
          .from("pipeline_payments")
          .update({
            status: "approved",
            updated_at: new Date().toISOString(),
          })
          .eq("id", payment.id);
      }
    } else if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      await supabaseAdmin
        .from("pipeline_payments")
        .update({
          status: "completed",
          external_payment_id: resource.id as string,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
    }
  }

  return NextResponse.json({ ok: true });
}
