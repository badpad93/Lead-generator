import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * POST /api/admin/website-requests/[id]/note
 * Body: { message, visibility?: 'internal' | 'public' }
 *
 * Internal notes never surface to the customer; public notes appear on
 * their timeline (used for "requesting more info" style comments).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  const visibility = body.visibility === "public" ? "public" : "internal";
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const { data: request } = await supabaseAdmin
    .from("website_requests")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from("website_request_activity")
    .insert({
      request_id: id,
      actor_id: adminId,
      event_type: "note_added",
      visibility,
      message,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data });
}
