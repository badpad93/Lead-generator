import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { cancel } from "@/lib/leadGeneratorSubscription";

/**
 * POST /api/tools/lead-generator/cancel
 *
 * User-initiated cancellation. Immediate revoke per product decision —
 * access is cut the moment this returns.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await cancel(userId);
  return NextResponse.json({ ok: true });
}
