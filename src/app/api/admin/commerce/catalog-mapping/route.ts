import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserId } from "@/lib/adminAuth";
import { applyCatalogMapping, MappingError } from "@/lib/commerce/catalogMapping";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    catalog_key: z.string().min(1).max(64),
    qb_item_id: z.string().regex(/^\d{1,20}$/).nullable(),
    qb_item_name: z.string().max(200).nullable().optional(),
    tax_treatment: z.enum(["unset", "qbo_automated", "exempt"]),
    reason: z.string().max(500).nullable().optional(),
    confirm: z.boolean(),
  })
  .strict();

/**
 * POST /api/admin/commerce/catalog-mapping — link an existing QuickBooks
 * Item id and a tax treatment to one approved catalog row. Requires an
 * administrator and `confirm: true`; writes only catalog_items and an
 * audit_logs entry. Never contacts QuickBooks.
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid mapping request.", issues: parsed.error.issues.map((i) => i.message) }, { status: 422 });
  const b = parsed.data;
  try {
    const result = await applyCatalogMapping({ catalogKey: b.catalog_key, qbItemId: b.qb_item_id, qbItemName: b.qb_item_name ?? null, taxTreatment: b.tax_treatment, reason: b.reason ?? null, confirm: b.confirm, actorId: adminId });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof MappingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/commerce/catalog-mapping] failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "The mapping could not be saved." }, { status: 500 });
  }
}
