import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";
import { getEffectiveAttribution, setAttributions, isOrderLocked, type AttributionInput } from "@/lib/salesAttribution";

/**
 * GET /api/sales/orders/[id]/attributions
 *   Returns the current attribution rows + a `locked` flag + the current
 *   user's permission to edit.
 *
 * PUT — replace the full attribution set for this order.
 *   Body: { rows: [{ user_id, role_code, percentage, notes? }], change_reason? }
 *   Rules:
 *     - Non-elevated reps can only edit if unlocked AND they're either the
 *       assigned_rep_id / created_by of the order (Lead Owner rights).
 *       They CANNOT assign themselves credit on another rep's order.
 *     - Admins can always edit — reason required if locked.
 */

interface OrderMeta {
  assigned_rep_id: string | null;
  created_by: string | null;
}

async function loadOrderMeta(id: string): Promise<OrderMeta | null> {
  const { data } = await supabaseAdmin
    .from("sales_orders")
    .select("assigned_rep_id, created_by")
    .eq("id", id)
    .maybeSingle();
  return data as OrderMeta | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const meta = await loadOrderMeta(id);
  if (!meta) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const rows = await getEffectiveAttribution(id);
  const locked = await isOrderLocked(id);

  const isAdmin = isElevatedRole(user.role);
  const isLeadOwner = meta.assigned_rep_id === user.id || meta.created_by === user.id;
  const canEdit = isAdmin || (!locked && isLeadOwner);

  // Non-admin non-lead-owner reps see only their own row (privacy on
  // percentages that belong to other users). Lead Owner + admin see all.
  const visibleRows = isAdmin || isLeadOwner ? rows : rows.filter((r) => r.user_id === user.id);

  // Fetch display names for the visible rows
  const userIds = Array.from(new Set(visibleRows.map((r) => r.user_id)));
  const { data: profiles } = userIds.length > 0
    ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };
  const nameMap = new Map((profiles || []).map((p) => [p.id, { name: p.full_name, email: p.email }]));

  return NextResponse.json({
    rows: visibleRows.map((r) => ({
      ...r,
      user_name: nameMap.get(r.user_id)?.name || null,
      user_email: nameMap.get(r.user_id)?.email || null,
    })),
    locked,
    can_edit: canEdit,
    is_admin_editor: isAdmin,
    total_percentage: visibleRows.reduce((sum, r) => sum + Number(r.percentage || 0), 0),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const meta = await loadOrderMeta(id);
  if (!meta) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isAdmin = isElevatedRole(user.role);
  const isLeadOwner = meta.assigned_rep_id === user.id || meta.created_by === user.id;
  const locked = await isOrderLocked(id);

  if (!isAdmin) {
    if (locked) return NextResponse.json({ error: "Attribution is locked. Contact an admin to change it." }, { status: 403 });
    if (!isLeadOwner) return NextResponse.json({ error: "Only the Lead Owner or an admin can set attribution for this order." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  const rows: AttributionInput[] = rawRows
    .filter((r: unknown): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r: Record<string, unknown>) => ({
      user_id: String(r.user_id || ""),
      role_code: String(r.role_code || ""),
      percentage: Number(r.percentage || 0),
      notes: typeof r.notes === "string" ? r.notes : null,
    }));

  // Lead Owner sanity: non-admin reps cannot remove themselves entirely.
  // They can share credit but must retain at least 1%.
  if (!isAdmin) {
    const selfShare = rows.find((r) => r.user_id === user.id);
    if (!selfShare || Number(selfShare.percentage) <= 0) {
      return NextResponse.json({ error: "As Lead Owner you must retain at least 1% credit. Ask an admin to reassign fully." }, { status: 400 });
    }
  }

  try {
    const written = await setAttributions({
      orderId: id,
      rows,
      actorId: user.id,
      authorizedAsAdmin: isAdmin,
      changeReason: typeof body.change_reason === "string" ? body.change_reason : null,
    });
    return NextResponse.json({ ok: true, rows: written });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
