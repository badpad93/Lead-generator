import { NextResponse } from "next/server";
import { getCoffeeSettings } from "@/lib/coffeeSettings";

/**
 * GET /api/coffee/settings — public read of policy knobs the shop /
 * cart / checkout UIs need to show the minimum order threshold to
 * every visitor (including guests). Only exposes fields safe to
 * publish; admin-only fields would live at /api/admin/coffee/settings.
 */
export async function GET() {
  const settings = await getCoffeeSettings();
  return NextResponse.json({
    minimum_order_cents: settings.minimum_order_cents,
    minimum_order_enforced: settings.minimum_order_enforced,
  });
}
