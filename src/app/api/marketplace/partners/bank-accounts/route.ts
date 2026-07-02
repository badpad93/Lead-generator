import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlacementPartner, forbidden } from "@/lib/marketplaceAuth";

/**
 * GET — return the partner's active bank account. Full numbers are omitted;
 * only display-safe fields (last4, holder, method) come back.
 * POST — create/replace the partner's active bank account (upsert; sets the
 * previous one inactive first).
 *
 * routing_number + account_number never appear in responses. They live in DB
 * for service-role code paths only (QB sync, admin payouts page).
 */

function last4(s: string | null | undefined): string | null {
  if (!s) return null;
  const digits = String(s).replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export async function GET(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const { data } = await supabaseAdmin
    .from("placement_bank_accounts")
    .select("id, method, bank_name, account_holder, account_type, routing_last4, account_last4, verified_at, notes, created_at")
    .eq("partner_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ bank_account: data || null });
}

export async function POST(req: NextRequest) {
  const user = await getPlacementPartner(req);
  if (!user) return forbidden();

  const body = await req.json().catch(() => ({}));
  const method = ["ach", "manual_check", "zelle", "venmo", "wire"].includes(body.method) ? body.method : "ach";
  const bankName = String(body.bank_name || "").trim();
  const accountHolder = String(body.account_holder || "").trim();
  const accountType = ["checking", "savings"].includes(body.account_type) ? body.account_type : null;
  const routingNumber = String(body.routing_number || "").trim();
  const accountNumber = String(body.account_number || "").trim();
  const notes = String(body.notes || "").trim();

  if (method === "ach" || method === "wire") {
    if (!bankName) return NextResponse.json({ error: "Bank name is required" }, { status: 400 });
    if (!accountHolder) return NextResponse.json({ error: "Account holder name is required" }, { status: 400 });
    const routingDigits = routingNumber.replace(/\D/g, "");
    const accountDigits = accountNumber.replace(/\D/g, "");
    if (routingDigits.length !== 9) return NextResponse.json({ error: "Routing number must be 9 digits" }, { status: 400 });
    if (accountDigits.length < 4 || accountDigits.length > 17) {
      return NextResponse.json({ error: "Account number must be 4-17 digits" }, { status: 400 });
    }
  } else {
    if (!accountHolder) return NextResponse.json({ error: "Account holder / payee name is required" }, { status: 400 });
  }

  // Retire the current active account (audit-preserving — we don't delete).
  await supabaseAdmin
    .from("placement_bank_accounts")
    .update({ active: false })
    .eq("partner_id", user.id)
    .eq("active", true);

  const insertRow = {
    partner_id: user.id,
    method,
    bank_name: bankName || null,
    account_holder: accountHolder || null,
    account_type: accountType,
    routing_number: routingNumber.replace(/\D/g, "") || null,
    account_number: accountNumber.replace(/\D/g, "") || null,
    routing_last4: last4(routingNumber),
    account_last4: last4(accountNumber),
    notes: notes || null,
    active: true,
    verified_at: null,
    qb_vendor_synced_at: null,
  };

  const { data: newRow, error } = await supabaseAdmin
    .from("placement_bank_accounts")
    .insert(insertRow)
    .select("id, method, bank_name, account_holder, account_type, routing_last4, account_last4, notes, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("placement_partner_activity").insert({
    partner_id: user.id,
    actor_id: user.id,
    activity_type: "bank_updated",
    description: `Payout details updated (${method})${insertRow.account_last4 ? ` — ****${insertRow.account_last4}` : ""}`,
  });

  return NextResponse.json({ bank_account: newRow });
}
