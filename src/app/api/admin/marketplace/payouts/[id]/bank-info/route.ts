import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * Reveals the full ACH details for a payout so admin can run the transfer.
 * Explicitly admin-only. Fetched on demand (not embedded in the list) so
 * the full account/routing numbers only cross the wire when the admin
 * actually clicks the reveal button.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: payout } = await supabaseAdmin
    .from("marketplace_payouts")
    .select("id, partner_id, amount")
    .eq("id", id)
    .maybeSingle();
  if (!payout) return NextResponse.json({ error: "Payout not found" }, { status: 404 });

  const { data: bank } = await supabaseAdmin
    .from("placement_bank_accounts")
    .select("method, bank_name, account_holder, account_type, routing_number, account_number, notes, verified_at")
    .eq("partner_id", payout.partner_id)
    .eq("active", true)
    .maybeSingle();

  if (!bank) return NextResponse.json({ bank_account: null });
  return NextResponse.json({ bank_account: bank });
}
