import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type");

  let query = supabaseAdmin
    .from("pipelines")
    .select("*, pipeline_steps(id, name, order_index, requires_document, requires_signature, requires_payment, requires_admin_approval, payment_amount, payment_description)")
    .order("name");

  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sorted = (data || []).map((p) => ({
    ...p,
    pipeline_steps: (p.pipeline_steps || []).sort(
      (a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index
    ),
  }));

  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, type } = body;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("pipelines")
    .insert({ name, type: type || "sales", created_by: user.id })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
