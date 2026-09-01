import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { adjustCommission, CommissionError } from "@/lib/storefront/commissions";

/**
 * Admin-only manual commission adjustment. Writes a signed row
 * (+ or -) referencing the original line item; the deterministic
 * idempotency key includes the actor id + ISO timestamp so a
 * re-post never double-writes.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    order_id?: string;
    coffee_order_item_id?: string;
    amount?: number;
    reason?: string;
  };
  if (
    !body.order_id ||
    !body.coffee_order_item_id ||
    typeof body.amount !== "number" ||
    !body.reason
  ) {
    return NextResponse.json(
      { error: "order_id, coffee_order_item_id, amount, reason required" },
      { status: 400 },
    );
  }
  try {
    const row = await adjustCommission({
      orderId: body.order_id,
      coffeeOrderItemId: body.coffee_order_item_id,
      adjustmentAmount: body.amount,
      reason: body.reason,
      actorId: adminId,
    });
    return NextResponse.json({ row });
  } catch (err) {
    if (err instanceof CommissionError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[admin/commissions/adjust] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
