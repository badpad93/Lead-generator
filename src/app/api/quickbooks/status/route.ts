import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { getPaymentProvider } from "@/lib/paymentProvider";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from("quickbooks_connection")
    .select("id, realm_id, company_name, connected_at, token_expires_at")
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    connected: !!data,
    provider: getPaymentProvider(),
    connection: data ? {
      companyName: data.company_name,
      realmId: data.realm_id,
      connectedAt: data.connected_at,
      tokenExpiresAt: data.token_expires_at,
    } : null,
  });
}

export async function DELETE(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  await supabaseAdmin
    .from("quickbooks_connection")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  return NextResponse.json({ ok: true });
}
