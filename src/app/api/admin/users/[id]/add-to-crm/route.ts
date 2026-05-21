import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const assignedTo = body.assigned_to || null;

  const entityMap: Record<string, string> = {
    operator: "operator",
    location_manager: "location",
    requestor: "location",
  };
  const entityType = entityMap[profile.role] || null;

  const businessName = profile.company_name || profile.full_name || profile.email;

  const { data: existingLead } = await supabaseAdmin
    .from("sales_leads")
    .select("id")
    .eq("business_name", businessName)
    .limit(1)
    .maybeSingle();

  if (existingLead) {
    return NextResponse.json({ error: "This user is already in the CRM" }, { status: 409 });
  }

  const { data: account, error: acctErr } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name: businessName,
      contact_name: profile.full_name || null,
      phone: profile.phone || null,
      email: profile.email || null,
      address: profile.address || null,
      entity_type: entityType,
      assigned_to: assignedTo,
      created_by: adminId,
    })
    .select("id")
    .single();

  if (acctErr) {
    return NextResponse.json(
      { error: `Account create failed: ${acctErr.message}` },
      { status: 500 }
    );
  }

  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("sales_leads")
    .insert({
      business_name: businessName,
      contact_name: profile.full_name || null,
      phone: profile.phone || null,
      email: profile.email || null,
      address: profile.address || null,
      city: profile.city || null,
      state: profile.state || null,
      source: "platform_user",
      notes: `Added from admin panel. Platform role: ${profile.role}`,
      entity_type: entityType,
      created_by: adminId,
      assigned_to: assignedTo,
      account_id: account.id,
    })
    .select("*")
    .single();

  if (leadErr) {
    return NextResponse.json(
      { error: `Lead create failed: ${leadErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(lead, { status: 201 });
}
