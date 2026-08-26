import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/admin/payroll/profiles/[id]/mark-active
 *
 * Admin-only. Flips a payroll profile to status='payroll_active' —
 * used after the admin has manually entered the worker into
 * QuickBooks Payroll. Also stamps a status='ready_for_quickbooks'
 * transition if the admin skipped that intermediate marker.
 *
 * Body: { note?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getSalesUser(req);
  if (!actor || actor.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.slice(0, 500) : null;

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("payroll_profiles")
    .update({
      status: "payroll_active",
      payroll_active_at: nowIso,
      payroll_active_by: actor.id,
      updated_at: nowIso,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("payroll_audit_events").insert({
    profile_id: id,
    actor_user_id: actor.id,
    actor_kind: "admin",
    event_type: "payroll.marked_active",
    description: note ?? "Admin marked payroll active (worker set up in QuickBooks).",
  });

  return NextResponse.json({ ok: true });
}
