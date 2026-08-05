import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { cancelPurchaseOrder } from "@/lib/inventory/purchaseOrders";

/**
 * POST /api/admin/inventory/purchase-orders/[id]/cancel
 * Body: { reason: string }
 * Only valid on draft or sent POs with no receipts.
 */
const bodySchema = z.object({ reason: z.string().min(1).max(500) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  try {
    const purchaseOrder = await cancelPurchaseOrder(id, parsed.data.reason, adminId);
    return NextResponse.json({ ok: true, purchase_order: purchaseOrder });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cancel failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
