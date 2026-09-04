import { NextRequest, NextResponse } from "next/server";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

/**
 * GET /api/sales/me — who is looking at this page.
 *
 * The CRM needed a cheap way to ask "is this person elevated?" without
 * pulling the whole team roster from /api/sales/users just to find one
 * row. Used by the order page to decide whether to show the admin-only
 * manual payment control.
 */
export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    role: user.role,
    elevated: isElevatedRole(user.role),
  });
}
