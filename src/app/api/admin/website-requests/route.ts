import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET /api/admin/website-requests
 *
 * Admin queue with filter/search. Returns request rows joined with the
 * submitting profile (name/email) so the list view can render account
 * context without a follow-up hop.
 *
 * Query params:
 *   status      — optional status filter
 *   assigned_to — optional user id (or "unassigned")
 *   q           — free-text search over business_name / primary_contact / email
 *   limit       — 1..200 (default 100)
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const assignedTo = url.searchParams.get("assigned_to");
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") || 100)));

  let query = supabaseAdmin
    .from("website_requests")
    .select(`
      id, status, business_name, primary_contact, email, phone,
      current_domain, existing_website, assigned_to, submitted_at, created_at, updated_at,
      user:user_id(id, full_name, email, role)
    `)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);
  if (assignedTo === "unassigned") query = query.is("assigned_to", null);
  else if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (q) {
    const s = q.replace(/[%,]/g, "");
    query = query.or(`business_name.ilike.%${s}%,primary_contact.ilike.%${s}%,email.ilike.%${s}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data || [] });
}
