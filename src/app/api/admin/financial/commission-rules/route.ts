import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * GET  /api/admin/financial/commission-rules — list all (active + archived)
 * POST /api/admin/financial/commission-rules — create a new rule
 */

function computePriority(userId: string | null, roleCode: string | null, category: string | null): number {
  return (userId ? 1000 : 0) + (roleCode ? 100 : 0) + (category ? 10 : 0);
}

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("commission_rules")
    .select("*, user:user_id(id, full_name, email)")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const user_id = body.user_id ? String(body.user_id) : null;
  const role_code = body.role_code ? String(body.role_code) : null;
  const category = body.category ? String(body.category).toLowerCase().trim() : null;
  const rate_bps = Number(body.rate_bps);
  const hold_days = Number(body.hold_days ?? 0);
  const notes = body.notes ? String(body.notes) : null;
  const is_default = !!body.is_default;

  if (!Number.isFinite(rate_bps) || rate_bps < 0 || rate_bps > 10000) {
    return NextResponse.json({ error: "rate_bps must be 0-10000." }, { status: 400 });
  }
  if (!Number.isFinite(hold_days) || hold_days < 0 || hold_days > 365) {
    return NextResponse.json({ error: "hold_days must be 0-365." }, { status: 400 });
  }
  if (is_default && (user_id || role_code || category)) {
    return NextResponse.json({ error: "Default rule cannot target a user/role/category." }, { status: 400 });
  }
  if (!is_default && !user_id && !role_code && !category) {
    return NextResponse.json({ error: "Non-default rule must specify at least one of user, role, category." }, { status: 400 });
  }

  const priority = computePriority(user_id, role_code, category);

  const { data, error } = await supabaseAdmin
    .from("commission_rules")
    .insert({
      user_id,
      role_code,
      category,
      rate_bps,
      hold_days,
      priority,
      is_default,
      is_active: true,
      notes,
      created_by: adminId,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog({
    actorId: adminId,
    action: "commission_rule_created",
    entityType: "commission_rule",
    entityId: data.id,
    after: data as unknown as Record<string, unknown>,
  });

  return NextResponse.json(data);
}
