import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { updateOrderItemSchema } from "@/lib/workflows/schemas";
import { updateOrderItem } from "@/lib/workflows/service";

/**
 * PATCH /api/workflows/[id]/order-items/[itemId]
 *
 * Update a workflow order-item's fulfillment status (used for coffee
 * orders attached to the coffee_service workflow). Admin/user can flip
 * an order to 'fulfilled' independently of the parent workflow status.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.edit_status")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, itemId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateOrderItemSchema.safeParse({
    ...body,
    workflowId: id,
    orderItemId: itemId,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const item = await updateOrderItem({ ...parsed.data, fulfilledBy: actor.id });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
