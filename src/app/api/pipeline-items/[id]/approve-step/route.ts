import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id: itemId } = await params;
  const body = await req.json();
  const { step_id, notes } = body;

  if (!step_id) {
    return NextResponse.json({ error: "step_id required" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("step_approvals")
    .select("id")
    .eq("pipeline_item_id", itemId)
    .eq("step_id", step_id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("step_approvals")
      .update({
        approved: true,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabaseAdmin
    .from("step_approvals")
    .insert({
      pipeline_item_id: itemId,
      step_id,
      approved: true,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
