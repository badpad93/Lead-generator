import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  approveRecommendation,
  ignoreRecommendation,
  overrideRecommendation,
} from "@/lib/inventory/replenishment";

/**
 * PATCH /api/admin/inventory/replenishment/recommendations/[id]
 *
 * One endpoint for the three admin actions:
 *   { action: "approve" }
 *   { action: "override", final_order_qty: number, reason: string }
 *   { action: "ignore" }
 *
 * Approve promotes proposed → approved; final_order_qty defaults to
 * recommended_qty unless override was used previously.
 */

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({
    action: z.literal("override"),
    final_order_qty: z.number().min(0),
    reason: z.string().min(1).max(1000),
  }),
  z.object({ action: z.literal("ignore") }),
]);

export async function PATCH(
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
    switch (parsed.data.action) {
      case "approve":
        await approveRecommendation(id, adminId);
        break;
      case "override":
        await overrideRecommendation(
          id,
          parsed.data.final_order_qty,
          parsed.data.reason,
          adminId,
        );
        break;
      case "ignore":
        await ignoreRecommendation(id, adminId);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
