import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    business_name,
    contact_name,
    phone,
    email,
    address,
    city,
    state,
    entity_type,
    immediate_need,
  } = body;

  if (!business_name) {
    return NextResponse.json(
      { error: "business_name required" },
      { status: 400 }
    );
  }

  const { data: account, error: acctErr } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || user.email || null,
      address: address || null,
      entity_type: entity_type || null,
    })
    .select("id")
    .single();

  if (acctErr) {
    return NextResponse.json(
      { error: `Account create failed: ${acctErr.message}` },
      { status: 500 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || user.email || null,
      address: address || null,
      city: city || null,
      state: state || null,
      source: "website_signup",
      entity_type: entity_type || null,
      immediate_need: immediate_need || null,
      account_id: account.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
