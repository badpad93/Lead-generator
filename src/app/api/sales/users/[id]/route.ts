import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * DELETE /api/sales/users/[id]
 *
 * Admin-only: remove a sales-team member. Deletes:
 *   - The auth user (Supabase auth.users)
 *   - Cascades to profiles via FK
 *   - Sets assignment references (workflow_assignments, sales_leads.assigned_to,
 *     sales_orders.created_by, etc.) to NULL via existing ON DELETE SET NULL
 *     constraints — nothing else in the CRM breaks
 *
 * Refuses to delete:
 *   - The requester themselves (prevents lockout)
 *   - The last remaining admin (prevents system lockout)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;

  if (id === user.id) {
    return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });
  }

  const { data: target } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Last-admin guard
  if (target.role === "admin") {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining admin" },
        { status: 400 },
      );
    }
  }

  // Delete auth user — cascades to profiles.
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(id);
  if (authErr) {
    return NextResponse.json({ error: `Auth delete failed: ${authErr.message}` }, { status: 500 });
  }

  // Belt-and-suspenders: ensure the profile row is also gone. Some
  // schemas don't have the auth→profiles cascade wired.
  await supabaseAdmin.from("profiles").delete().eq("id", id);

  return NextResponse.json({
    ok: true,
    deleted: { id: target.id, email: target.email, role: target.role },
  });
}
