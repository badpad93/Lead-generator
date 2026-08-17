import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { getMarketplaceSettings, setPlatformTakeCents } from "@/lib/marketplace/settings";

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
  const raw = body.platform_take_cents;
  const cents = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(cents) || cents < 0) {
    return NextResponse.json(
      { error: "platform_take_cents must be a non-negative integer" },
      { status: 400 },
    );
  }

  try {
    const settings = await setPlatformTakeCents(Math.round(cents), adminId);
    return NextResponse.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
