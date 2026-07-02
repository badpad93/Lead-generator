import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Manually flip a payout to "paid" after admin runs the ACH / cuts the check.
 * Records who marked it, when, how, and an optional reference (check number,
 * ACH batch id, transaction id, etc.). Also fires the partner_payout_sent
 * notification if it wasn't already sent (to catch payouts that were paid
 * without ever going through QB).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const method = typeof body.method === "string" ? body.method.trim().slice(0, 40) : null;
  const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 120) : null;

  const now = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("marketplace_payouts")
    .update({
      status: "paid",
      paid_at: now,
      paid_method: method,
      paid_reference: reference,
      paid_by: adminId,
      updated_at: now,
    })
    .eq("id", id)
    .select("id, partner_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Fire-and-forget partner notification — no-op if already sent recently.
  try {
    const { notifyPartnerPayoutSent } = await import("@/lib/marketplaceNotifications");
    notifyPartnerPayoutSent(updated.id).catch(() => undefined);
  } catch { /* non-critical */ }

  return NextResponse.json({ ok: true });
}
