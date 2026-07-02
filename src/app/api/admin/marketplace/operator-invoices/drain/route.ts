import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { drainOperatorInvoices } from "@/lib/marketplaceQb";

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = await drainOperatorInvoices(50);
  return NextResponse.json(summary);
}
