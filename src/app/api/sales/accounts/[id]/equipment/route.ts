import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * GET  /api/sales/accounts/[id]/equipment
 * POST /api/sales/accounts/[id]/equipment
 *
 * Equipment assigned to a CRM account. Distinct from machine_listings
 * (machines for sale) — these rows represent hardware deployed at the
 * customer's location.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("account_equipment")
    .select("*")
    .eq("account_id", id)
    .order("assigned_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: data || [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Confirm the account exists — protects against orphan rows if the
  // caller passes a garbage account id.
  const { data: account } = await supabaseAdmin
    .from("sales_accounts")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Equipment name is required" }, { status: 400 });

  const assignedAt = typeof body.assigned_at === "string" && body.assigned_at
    ? new Date(body.assigned_at).toISOString()
    : new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("account_equipment")
    .insert({
      account_id: id,
      name,
      serial_number: typeof body.serial_number === "string" ? body.serial_number.trim() || null : null,
      model: typeof body.model === "string" ? body.model.trim() || null : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      assigned_at: assignedAt,
      assigned_by: user.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipment: data }, { status: 201 });
}
