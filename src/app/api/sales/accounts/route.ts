import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { filterByRole } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let query = supabaseAdmin
    .from("sales_accounts")
    .select("*")
    .order("created_at", { ascending: false });

  try {
    query = await filterByRole(query, user) as typeof query;
  } catch {
    if (user.role !== "admin" && user.role !== "director_of_sales") {
      return NextResponse.json([]);
    }
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { business_name, contact_name, phone, email, address, notes, entity_type } = body;
  if (!business_name)
    return NextResponse.json({ error: "business_name required" }, { status: 400 });
  if (!email)
    return NextResponse.json({ error: "email required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("sales_accounts")
    .insert({
      business_name,
      contact_name: contact_name || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
      entity_type: entity_type || null,
      assigned_to: user.id,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
