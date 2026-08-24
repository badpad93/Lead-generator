import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/coffee/products/reorder
 *   Body: { ordered_ids: string[] }
 *
 * Admin-only. Sets sort_order = index * 10 for every product in the
 * given order. Spaced by 10s so future inserts / single-row shifts
 * have room to slot between neighbors without a full renumber.
 *
 * The customer-facing /api/coffee/products list orders by
 * (sort_order ASC, name ASC), so after this endpoint runs the
 * storefront reflects the new order on the next fetch.
 *
 * Idempotent: sending the same array twice is a no-op.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ordered_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ordered_ids must be a non-empty array of product ids." },
      { status: 400 },
    );
  }
  const cleanIds = ids
    .filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v));
  if (cleanIds.length !== ids.length) {
    return NextResponse.json(
      { error: "ordered_ids contained values that are not valid product ids." },
      { status: 400 },
    );
  }
  if (new Set(cleanIds).size !== cleanIds.length) {
    return NextResponse.json(
      { error: "ordered_ids contained duplicates." },
      { status: 400 },
    );
  }

  // Bulk-update — one call per id is fine here (Postgres round-trip
  // cost is negligible for a product catalog of dozens, not
  // thousands). Wrapping in Promise.all so latency scales with the
  // slowest single update rather than the sum.
  const updates = cleanIds.map((id, i) =>
    supabaseAdmin
      .from("coffee_products")
      .update({ sort_order: i * 10 })
      .eq("id", id),
  );
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) {
    return NextResponse.json({ error: firstErr.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: cleanIds.length });
}
