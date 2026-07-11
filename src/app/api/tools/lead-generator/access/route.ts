import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getLeadGeneratorAccess } from "@/lib/leadGeneratorAccess";

/**
 * GET /api/tools/lead-generator/access
 *
 * Returns the full LG access decision for the caller so the
 * customer-facing shell can render the right state (badge, banner,
 * or bounce). Underlying resolver is the same one gating the actual
 * generation API — no divergence possible.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getLeadGeneratorAccess(userId);
  return NextResponse.json(access);
}
