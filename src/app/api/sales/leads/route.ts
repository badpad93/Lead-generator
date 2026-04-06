import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_leads")
    .select("*")
    .order("created_at", { ascending: false });

  // Sales users see leads assigned to them, unassigned leads, or leads they created
  if (user.role === "sales") {
    query = query.or(
      `assigned_to.eq.${user.id},assigned_to.is.null,created_by.eq.${user.id}`
    );
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hydrate assigned profile names from profiles (separate query — sales_leads
  // FK references auth.users, not profiles, so we can't embed via PostgREST).
  const leads = data || [];
  const ids = Array.from(
    new Set(leads.map((l) => l.assigned_to).filter(Boolean))
  ) as string[];

  let nameById: Record<string, { full_name: string | null; email: string | null }> = {};
  if (ids.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    nameById = Object.fromEntries(
      (profiles || []).map((p) => [p.id, { full_name: p.full_name, email: p.email }])
    );
  }

  const hydrated = leads.map((l) => ({
    ...l,
    assigned_profile: l.assigned_to ? nameById[l.assigned_to] || null : null,
  }));

  return NextResponse.json(hydrated);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { business_name, contact_name, phone, email, address, source, notes } = body;
  if (!business_name)
    return NextResponse.json({ error: "business_name required" }, { status: 400 });

  // Standard CRM behavior: creator owns the lead by default.
  // Auto-create a corresponding account so leads/deals/orders for this customer
  // all roll up to one record. Sales rep can add more details to the account later.
  const { data: account, error: acctErr } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      assigned_to: user.id,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (acctErr) {
    return NextResponse.json({ error: `Account create failed: ${acctErr.message}` }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("sales_leads")
    .insert({
      business_name,
      contact_name,
      phone,
      email,
      address,
      source: source || null,
      notes: notes || null,
      created_by: user.id,
      assigned_to: user.id,
      account_id: account.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
