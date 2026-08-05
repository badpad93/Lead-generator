import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { receiveLines } from "@/lib/inventory/purchaseOrders";

/**
 * POST /api/admin/inventory/purchase-orders/[id]/receive
 * Body: {
 *   receipts: [
 *     { purchase_order_line_id: uuid, received_qty: number, notes?: string }
 *   ]
 * }
 *
 * Post one or more partial receipts against this PO in a single call.
 * Each receipt writes a `receipt` inventory_transactions row via the
 * Phase 1 ledger service and inserts a purchase_order_receipts audit
 * row. The service recomputes PO status after all receipts land:
 *   sent → partially_received (any qty received, not all lines full)
 *   sent → received            (all lines full in one shot)
 *   partially_received → received (final receipts clear remaining)
 * Over-receipt is refused before any writes happen.
 */

const bodySchema = z.object({
  receipts: z
    .array(
      z.object({
        purchase_order_line_id: z.string().uuid(),
        received_qty: z.number().positive(),
        notes: z.string().max(2000).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  try {
    const result = await receiveLines(id, parsed.data.receipts, adminId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "receive failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
