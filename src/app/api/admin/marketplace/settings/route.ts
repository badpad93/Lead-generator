import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { getMarketplaceSettings, setPlatformTakeDollars } from "@/lib/marketplace/settings";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await getMarketplaceSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const raw = body.platform_take;
  const dollars = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(dollars) || dollars < 0) {
    return NextResponse.json(
      { error: "platform_take must be a non-negative dollar amount" },
      { status: 400 },
    );
  }

  try {
    const settings = await setPlatformTakeDollars(dollars, adminId);
    return NextResponse.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
