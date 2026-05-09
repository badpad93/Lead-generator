import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

/** PATCH — admin only (reassign, rename, update url) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Only admins can edit call lists" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();

  if (body.assigned_to === "all") {
    const { data: original } = await supabaseAdmin
      .from("sales_call_lists")
      .select("*")
      .eq("id", id)
      .single();

    if (!original) {
      return NextResponse.json({ error: "Call list not found" }, { status: 404 });
    }

    const { data: eligibleUsers } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "director_of_sales", "market_leader", "sales"]);

    const users = eligibleUsers || [];

    const existingAssignee = original.assigned_to;
    const otherUsers = users.filter((u) => u.id !== existingAssignee);

    if (existingAssignee) {
      await supabaseAdmin
        .from("sales_call_lists")
        .update({ assigned_to: existingAssignee })
        .eq("id", id);
    }

    if (otherUsers.length > 0) {
      const rows = otherUsers.map((u) => ({
        title: original.title,
        description: original.description,
        category: original.category,
        sheet_url: original.sheet_url,
        file_url: original.file_url,
        file_name: original.file_name,
        assigned_to: u.id,
        created_by: user.id,
      }));
      await supabaseAdmin.from("sales_call_lists").insert(rows);
    }

    return NextResponse.json({ ok: true, assigned_count: users.length });
  }

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
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Only admins can delete call lists" }, { status: 403 });
  }
  const { id } = await params;
  const { error } = await supabaseAdmin.from("sales_call_lists").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
