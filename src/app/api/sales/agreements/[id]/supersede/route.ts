import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { createReplacementAgreementForOrder } from "@/lib/agreements/reissue";

/**
 * POST /api/sales/agreements/[id]/supersede
 *
 * Admin/director only. Cancels an already-sent-or-viewed BUT unsigned
 * agreement and creates a fresh DRAFT replacement for the same order from the
 * current canonical snapshot (corrected template). The replacement is NOT
 * emailed — it is created as `draft` for human review, then sent via the
 * normal send flow. No invoice is created and order payment/invoice state is
 * untouched.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isElevatedRole(user.role)) {
    return NextResponse.json(
      { error: "Only admins or directors can supersede an agreement" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const { data: ag } = await supabaseAdmin
    .from("purchase_agreements")
    .select("id, order_id")
    .eq("id", id)
    .maybeSingle();
  if (!ag || !ag.order_id) {
    return NextResponse.json(
      { error: "Agreement not found or has no linked order" },
      { status: 404 },
    );
  }

  const result = await createReplacementAgreementForOrder(ag.order_id, id, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    superseded_agreement_id: result.supersededAgreementId,
    new_agreement: result.newAgreement,
  });
}
