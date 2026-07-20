import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { signedMediaUrl, CUSTOMER_EDITABLE_SCALARS, CUSTOMER_EDITABLE_JSONB } from "@/lib/websiteRequests";

/**
 * GET /api/admin/website-requests/[id]
 * PATCH /api/admin/website-requests/[id]
 *
 * Admin gets the full request row + media (with fresh signed URLs) +
 * full activity log (both public and internal entries).
 *
 * PATCH accepts any customer-editable field (so admin can correct
 * intake on behalf of the customer) plus admin-only fields
 * assigned_to. Status changes and internal notes go through their
 * dedicated routes so the activity log stays clean.
 */

const ADMIN_ONLY_EDITABLE = new Set(["assigned_to"]);
const CUSTOMER_KEYS = new Set<string>([...CUSTOMER_EDITABLE_SCALARS, ...CUSTOMER_EDITABLE_JSONB]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const [{ data: request }, { data: media }, { data: activity }] = await Promise.all([
    supabaseAdmin
      .from("website_requests")
      .select(`*, user:user_id(id, full_name, email, role, phone, company_name), assignee:assigned_to(id, full_name, email)`)
      .eq("id", id)
      .maybeSingle(),
    supabaseAdmin
      .from("website_request_media")
      .select("*")
      .eq("request_id", id)
      .order("sort_order"),
    supabaseAdmin
      .from("website_request_activity")
      .select(`*, actor:actor_id(id, full_name, email)`)
      .eq("request_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mediaWithUrls = await Promise.all(
    (media || []).map(async (m) => ({
      ...m,
      signed_url: m.file_path ? await signedMediaUrl(m.file_path, 900) : null,
    })),
  );

  return NextResponse.json({
    request,
    media: mediaWithUrls,
    activity: activity || [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (CUSTOMER_KEYS.has(k) || ADMIN_ONLY_EDITABLE.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 400 });
  }

  const { data: before } = await supabaseAdmin
    .from("website_requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: updated, error } = await supabaseAdmin
    .from("website_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("website_request_activity").insert({
    request_id: id,
    actor_id: adminId,
    event_type: "edited",
    visibility: "internal",
    message: "Admin edited intake",
    metadata: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ request: updated });
}
