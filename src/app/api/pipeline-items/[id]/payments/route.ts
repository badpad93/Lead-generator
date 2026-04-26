import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { createOrder } from "@/lib/paypal";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: itemId } = await params;

  const url = new URL(req.url);
  const stepId = url.searchParams.get("step_id");

  let query = supabaseAdmin
    .from("pipeline_payments")
    .select("*")
    .eq("pipeline_item_id", itemId)
    .order("created_at", { ascending: false });

  if (stepId) query = query.eq("step_id", stepId);

  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: itemId } = await params;
  const body = await req.json();

  const { step_id, amount, description, currency } = body;

  if (!step_id || !amount) {
    return NextResponse.json(
      { error: "step_id and amount required" },
      { status: 400 }
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  try {
    let externalOrderId: string | null = null;
    let paymentUrl: string | null = null;
    let status = "pending";

    if (process.env.PAYPAL_CLIENT_ID) {
      const order = await createOrder({
        amount: Number(amount),
        currency: currency || "USD",
        description:
          description || "Pipeline step payment",
        returnUrl: `${siteUrl}/api/pipeline-items/${itemId}/payments/callback?success=true`,
        cancelUrl: `${siteUrl}/api/pipeline-items/${itemId}/payments/callback?success=false`,
        referenceId: `${itemId}_${step_id}`,
      });

      externalOrderId = order.id;
      status = "created";
      const approveLink = order.links.find(
        (l: { rel: string }) => l.rel === "approve"
      );
      paymentUrl = approveLink?.href || null;
    }

    const { data, error } = await supabaseAdmin
      .from("pipeline_payments")
      .insert({
        pipeline_item_id: itemId,
        step_id,
        provider: "paypal",
        external_order_id: externalOrderId,
        amount: Number(amount),
        currency: currency || "USD",
        description: description || "Pipeline step payment",
        status,
        payment_url: paymentUrl,
      })
      .select("*")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
