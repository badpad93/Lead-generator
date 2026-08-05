import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { closePurchaseOrder } from "@/lib/inventory/purchaseOrders";

/**
 * POST /api/admin/inventory/purchase-orders/[id]/close
 *
 * Terminal wrap of a partially-received or fully-received PO. No
 * further receipts allowed after close. Use this when the supplier
 * confirms the remainder won't ship (short-shipped, backorder
 * abandoned, etc.).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  try {
    const purchaseOrder = await closePurchaseOrder(id, adminId);
    return NextResponse.json({ ok: true, purchase_order: purchaseOrder });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "close failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
