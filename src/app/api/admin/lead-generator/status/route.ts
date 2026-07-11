import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { getLeadGeneratorAccess } from "@/lib/leadGeneratorAccess";

/**
 * GET /api/admin/lead-generator/status?user_id=<uuid>
 *
 * Returns the resolver's decision for another user, so the admin edit
 * modal can render current LG entitlement state without duplicating
 * the business rule client-side.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const access = await getLeadGeneratorAccess(userId);
  return NextResponse.json(access);
}
