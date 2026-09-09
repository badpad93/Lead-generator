import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { loadKeyedCatalog, suggestMappings } from "@/lib/commerce/catalogReadiness";
import { createVinnieQuickBooks, vinnieQuickBooksGate } from "@/lib/commerce/quickbooksAdapter";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ request: z.literal("list_items") }).strict();

/**
 * POST /api/admin/commerce/qbo-items — an explicit administrator request
 * to list existing QuickBooks Items (read-only) through the live
 * production connection. Outside Production the adapter is never
 * constructed and the route answers 503. Returns safe fields only plus
 * unconfirmed suggestions; nothing is written anywhere.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Send { request: \"list_items\" } to confirm the lookup." }, { status: 422 });
  const gate = vinnieQuickBooksGate();
  if (!gate.allowed) return NextResponse.json({ error: gate.reason, available: false }, { status: 503 });
  try {
    const items = await createVinnieQuickBooks().listItems();
    const suggestions = suggestMappings(await loadKeyedCatalog(), items);
    return NextResponse.json({ items, suggestions, note: "Suggestions are exact SKU or normalized-name matches only. Each mapping must be confirmed by an administrator." });
  } catch (e) {
    console.error("[admin/commerce/qbo-items] lookup failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "QuickBooks Items could not be listed right now." }, { status: 502 });
  }
}
