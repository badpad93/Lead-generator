import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { sendWebsiteRequestNotification } from "@/lib/websiteRequestEmail";

/**
 * POST /api/admin/website-requests/[id]/request-info
 * Body: { message }
 *
 * Flips the request to needs_information + records a public activity
 * entry with the admin's message so the customer knows exactly what
 * they need to provide. Fires the needs_information notification.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!message) return NextResponse.json({ error: "message is required" }, { status: 400 });

  const { data: existing } = await supabaseAdmin
    .from("website_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("website_requests")
    .update({ status: "needs_information", updated_at: nowIso })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("website_request_activity").insert({
    request_id: id,
    actor_id: adminId,
    event_type: "info_requested",
    visibility: "public",
    previous_status: existing.status,
    new_status: "needs_information",
    message,
  });

  try {
    await sendWebsiteRequestNotification({
      event: "needs_information",
      request: updated,
    });
  } catch (e) {
    console.error("[admin.request-info] notification failed:", e);
  }

  return NextResponse.json({ request: updated });
}
