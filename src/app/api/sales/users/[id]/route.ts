import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * DELETE /api/sales/users/[id]
 *
 * Admin-only: remove a sales-team member.
 *
 * Strategy mirrors /api/admin/users/[id]: try hard delete of the
 * profile row first (works when the account has no referenced
 * history). If Postgres blocks the delete with a foreign-key
 * violation — because the rep is referenced by workflows,
 * orders, assignments, etc. — fall back to a soft delete that
 * redacts the PII, stamps deleted_at, and deletes the auth user
 * so the account cannot log in again.
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

  // Last-admin guard.
  if (target.role === "admin") {
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .is("deleted_at", null);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining admin" },
        { status: 400 },
      );
    }
  }

  // Try hard delete first.
  const { error: hardErr } = await supabaseAdmin.from("profiles").delete().eq("id", id);
  if (!hardErr) {
    // Try auth soft-delete (Supabase marks auth.users.deleted_at
    // and blocks sign-in without physically removing the row).
    // Fall back to hard delete if soft-delete is unsupported.
    const soft = await supabaseAdmin.auth.admin.deleteUser(id, true);
    if (soft.error && !/not.*found/i.test(soft.error.message)) {
      const hard = await supabaseAdmin.auth.admin.deleteUser(id);
      if (hard.error && !/not.*found/i.test(hard.error.message)) {
        return NextResponse.json(
          { error: `Auth delete failed: ${hard.error.message}` },
          { status: 500 },
        );
      }
    }
    return NextResponse.json({
      ok: true,
      mode: "hard",
      deleted: { id: target.id, email: target.email, role: target.role },
    });
  }

  const isFkBlock =
    hardErr.code === "23503" ||
    /foreign key/i.test(hardErr.message) ||
    /violates.*constraint/i.test(hardErr.message);
  if (!isFkBlock) {
    return NextResponse.json({ error: hardErr.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const anonEmail = `deleted+${id.slice(0, 8)}@vendingconnector.local`;
  const { error: softErr } = await supabaseAdmin
    .from("profiles")
    .update({
      deleted_at: nowIso,
      full_name: "Deleted User",
      email: anonEmail,
      phone: null,
      address: null,
      city: null,
      state: null,
      zip: null,
      company_name: null,
      bio: null,
      website: null,
      featured: false,
      coffee_access_enabled: false,
    })
    .eq("id", id);
  if (softErr) {
    return NextResponse.json(
      { error: `Soft delete failed: ${softErr.message}` },
      { status: 500 },
    );
  }

  // Prefer soft-delete on the auth side so the FK cascade that
  // just blocked the profile hard-delete doesn't hit again. Fall
  // through to hard delete, then to a 100-year ban if both fail.
  const softAuth = await supabaseAdmin.auth.admin.deleteUser(id, true);
  let authBlocked = !softAuth.error || /not.*found/i.test(softAuth.error.message);
  let authMessage: string | null = softAuth.error?.message ?? null;
  if (!authBlocked) {
    const hardAuth = await supabaseAdmin.auth.admin.deleteUser(id);
    if (!hardAuth.error || /not.*found/i.test(hardAuth.error.message)) {
      authBlocked = true;
      authMessage = null;
    } else {
      authMessage = hardAuth.error.message;
      const banned = await supabaseAdmin.auth.admin.updateUserById(id, {
        ban_duration: "876000h",
      });
      if (!banned.error) {
        authBlocked = true;
        authMessage = null;
      } else {
        authMessage = banned.error.message;
      }
    }
  }
  if (!authBlocked) {
    return NextResponse.json(
      {
        error:
          "Profile anonymized but the auth account could not be disabled. " +
          `Please disable the account manually in Supabase Auth. (${authMessage ?? "unknown error"})`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    mode: "soft",
    deleted: { id: target.id, email: target.email, role: target.role },
  });
}
