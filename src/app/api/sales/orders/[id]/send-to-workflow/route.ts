import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { spawnLocationServicesWorkflowFromPaidOrder } from "@/lib/workflows/paymentSync";

/**
 * POST /api/sales/orders/[id]/send-to-workflow
 *
 * Admin-only manual fallback for the auto-spawn path. Force-creates
 * the workflow linked to this sales_order using the same helper the
 * QB webhook + manual mark-paid path use.
 *
 * Idempotent: if a workflow is already linked, returns that one
 * instead of creating a duplicate.
 *
 * Today: only wired for order_type = 'location_services'. Other
 * types can be added by extending the switch below — most other
 * order types (AI machines, financing, coffee) spawn their
 * workflows from different upstream signals (agreement signed,
 * coffee_order placed, etc.) that don't route through sales_orders.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const { data: order, error: orderErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_type")
    .eq("id", id)
    .maybeSingle();
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Existing workflow — return early rather than create a duplicate.
  const { data: existing } = await supabaseAdmin
    .from("workflows")
    .select("id, workflow_number")
    .eq("order_id", order.id)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({
      ok: true,
      already_linked: true,
      workflow_id: existing.id,
      workflow_number: (existing as { workflow_number?: string }).workflow_number ?? null,
    });
  }

  if (order.order_type === "location_services") {
    try {
      const workflowId = await spawnLocationServicesWorkflowFromPaidOrder(order.id);
      if (!workflowId) {
        return NextResponse.json(
          {
            error:
              "Could not spawn the workflow — the spawn helper returned null. Most likely the underlying sales_lead is missing data, or provisional-profile provisioning failed. Check the server logs and try again.",
          },
          { status: 500 },
        );
      }
      const { data: created } = await supabaseAdmin
        .from("workflows")
        .select("id, workflow_number")
        .eq("id", workflowId)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        already_linked: false,
        workflow_id: workflowId,
        workflow_number: created?.workflow_number ?? null,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Spawn failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    {
      error: `Send-to-workflow isn't wired for order_type '${order.order_type ?? "(none)"}' yet. Location Services is the only supported type today — other types spawn workflows from different upstream signals (agreement signed, coffee order placed, etc.).`,
    },
    { status: 400 },
  );
}
