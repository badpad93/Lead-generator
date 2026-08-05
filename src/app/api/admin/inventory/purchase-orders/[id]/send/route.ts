import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { sendPurchaseOrder } from "@/lib/inventory/purchaseOrders";

/**
 * POST /api/admin/inventory/purchase-orders/[id]/send
 * Transitions draft → sent. No body required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  try {
    const purchaseOrder = await sendPurchaseOrder(id, adminId);
    return NextResponse.json({ ok: true, purchase_order: purchaseOrder });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
