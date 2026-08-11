import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { getCoffeeSettings, updateCoffeeSettings } from "@/lib/coffeeSettings";

/**
 * GET  /api/admin/coffee/settings — read singleton settings row
 * PATCH /api/admin/coffee/settings — update minimum_order_cents /
 *   minimum_order_enforced. Admin-only; every write stamps updated_by
 *   so we can trace who moved the number in an audit later.
 *
 * Public / operator callers don't need to hit this — the checkout
 * paths read via getCoffeeSettings() directly, and the shop/cart UI
 * pulls from a lightweight public endpoint (see /api/coffee/settings)
 * so unauth visitors see the minimum before signing in.
 */

const patchSchema = z.object({
  minimum_order_cents: z.number().int().min(0).max(1_000_000).optional(),
  minimum_order_enforced: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await getCoffeeSettings();
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 },
    );
  }

  try {
    const updated = await updateCoffeeSettings(parsed.data, adminId);
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
