import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { createPurchaseOrdersFromRun } from "@/lib/inventory/replenishment";

/**
 * POST /api/admin/inventory/replenishment/runs/[id]/create-purchase-orders
 *
 * Groups every `approved` recommendation in this run by preferred
 * supplier and creates one draft PO per supplier. Recommendations get
 * flipped to `ordered` with `ordered_purchase_order_id` set. Recs
 * without a preferred supplier are skipped and returned in
 * `skippedNoSupplier`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  try {
    const result = await createPurchaseOrdersFromRun(id, adminId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "create failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
