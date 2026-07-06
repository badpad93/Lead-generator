import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/marketplace/agreements
 *
 * Admin queue of user_agreements. Filters:
 *   status  — e.g. provider_signed_pending_company_countersign, fully_executed
 *   type    — default 'placement_provider'
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const type = url.searchParams.get("type") || "placement_provider";
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get("limit") || 200)));

  let query = supabaseAdmin
    .from("user_agreements")
    .select(`
      *,
      user:user_id(id, full_name, email, company_name),
      template:agreement_template_id(id, version, title, effective_date)
    `)
    .eq("agreement_type", type)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
