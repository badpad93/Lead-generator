import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";

/** GET /api/admin/check — verify if current user is admin */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  return NextResponse.json({ isAdmin: !!adminId });
}
