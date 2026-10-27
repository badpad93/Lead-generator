import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { getSmartCoolerSettings, updateSmartCoolerSettings } from "@/lib/smartCoolerSettings";

/**
 * GET   /api/admin/smart-coolers/settings — read the singleton settings.
 * PATCH /api/admin/smart-coolers/settings — edit the lead-time / delivery
 *   purchase banner (enabled + message). Admin-only.
 */

const patchSchema = z.object({
  bannerEnabled: z.boolean().optional(),
  bannerMessage: z.string().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getSmartCoolerSettings());
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  try {
    return NextResponse.json(await updateSmartCoolerSettings(parsed.data, adminId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
