import { NextRequest, NextResponse } from "next/server";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { addShipmentSchema } from "@/lib/workflows/schemas";
import { addShipment } from "@/lib/workflows/service";

/**
 * POST /api/workflows/[id]/shipments
 *
 * Record a shipment against the workflow. Requires edit_quantity —
 * shipments are the vehicle used to increment shipped/delivered
 * quantity on machine + coffee fulfillment workflows.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.edit_quantity")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = addShipmentSchema.safeParse({ ...body, workflowId: id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const shipment = await addShipment({ ...parsed.data, createdBy: actor.id });
    return NextResponse.json({ ok: true, shipment });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
