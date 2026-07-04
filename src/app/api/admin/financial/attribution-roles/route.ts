import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * GET — list all roles (active + inactive) for admin.
 *   Rep-facing dropdowns hit the RLS-scoped view directly which only returns
 *   active rows; this endpoint returns everything for the settings page.
 * POST — create a new role.
 */

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("attribution_roles")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const label = String(body.label || "").trim();
  const description = String(body.description || "").trim();
  const sortOrder = Number.isFinite(Number(body.sort_order)) ? Math.max(0, Math.min(9999, Number(body.sort_order))) : 100;

  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("attribution_roles")
    .insert({
      code,
      label,
      description: description || null,
      sort_order: sortOrder,
      is_active: true,
      is_system: false,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog({
    actorId: adminId,
    action: "attribution_role_created",
    entityType: "attribution_role",
    entityId: data.id,
    after: data,
  });

  return NextResponse.json(data);
}
