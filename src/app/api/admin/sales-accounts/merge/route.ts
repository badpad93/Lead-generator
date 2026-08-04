import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/sales-accounts/merge
 * Body: { canonical_id, absorbed_ids: [], notes?, dry_run?: boolean }
 *
 * Delegates to the merge_sales_accounts() PL/pgSQL function so the
 * entire merge (FK sweep + soft-delete of absorbed rows + audit log
 * write) happens in a single implicit transaction. If dry_run is true,
 * returns a preview payload (row counts per table that WOULD move)
 * without invoking the function.
 */

const bodySchema = z.object({
  canonical_id: z.string().uuid(),
  absorbed_ids: z.array(z.string().uuid()).min(1).max(50),
  notes: z.string().max(1000).optional(),
  dry_run: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }
  const { canonical_id, absorbed_ids, notes, dry_run } = parsed.data;

  if (absorbed_ids.includes(canonical_id)) {
    return NextResponse.json({ error: "canonical_id cannot appear in absorbed_ids" }, { status: 400 });
  }

  if (dry_run) {
    // Preview only: enumerate what would move. Read-only.
    const tables = [
      "sales_orders", "sales_leads", "sales_deals", "sales_documents",
      "intake_leads", "location_requests", "pipeline_items",
      "agreement_tokens", "invoices", "payments", "account_equipment",
    ] as const;
    const previewByTable: Record<string, number> = {};
    for (const t of tables) {
      const { count } = await supabaseAdmin
        .from(t)
        .select("*", { count: "exact", head: true })
        .in("account_id", absorbed_ids);
      previewByTable[t] = count ?? 0;
    }
    const { count: wfCount } = await supabaseAdmin
      .from("workflows")
      .select("*", { count: "exact", head: true })
      .in("company_id", absorbed_ids);
    previewByTable["workflows"] = wfCount ?? 0;
    return NextResponse.json({ dry_run: true, canonical_id, absorbed_ids, preview: previewByTable });
  }

  const { data, error } = await supabaseAdmin.rpc("merge_sales_accounts", {
    p_canonical_id: canonical_id,
    p_absorbed_ids: absorbed_ids,
    p_merged_by: adminId,
    p_notes: notes ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
