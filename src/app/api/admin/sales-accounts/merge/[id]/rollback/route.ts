import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/sales-accounts/merge/[id]/rollback
 *
 * Reverses ONE merge cleanly via rollback_sales_account_merge() —
 * reads fk_swap_details and swaps only the specific rows this merge
 * touched, so unrelated later merges on the same canonical aren't
 * disturbed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { data, error } = await supabaseAdmin.rpc("rollback_sales_account_merge", {
    p_merge_id: id,
    p_rolled_back_by: adminId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
