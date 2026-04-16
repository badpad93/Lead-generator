import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isCrmAdmin } from "@/lib/salesAuth";

/** PATCH — admin only (reassign, rename, update url) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isCrmAdmin(user)) {
    return NextResponse.json({ error: "Only admins can edit call lists" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  const allowed = ["title", "description", "category", "sheet_url", "file_url", "file_name", "assigned_to"];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = body[k];

  const { data, error } = await supabaseAdmin
    .from("sales_call_lists")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

/** DELETE — admin only */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isCrmAdmin(user)) {
    return NextResponse.json({ error: "Only admins can delete call lists" }, { status: 403 });
  }
  const { id } = await params;
  const { error } = await supabaseAdmin.from("sales_call_lists").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
