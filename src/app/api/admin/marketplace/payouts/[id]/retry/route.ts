import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { pushPayoutToQb } from "@/lib/marketplaceQb";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const result = await pushPayoutToQb(id);
  if (!result.ok) return NextResponse.json({ error: result.error || "Failed" }, { status: 400 });
  return NextResponse.json({ ok: true, qb_bill_id: result.externalId });
}
