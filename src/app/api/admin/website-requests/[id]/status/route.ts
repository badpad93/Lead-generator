import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { sendWebsiteRequestNotification } from "@/lib/websiteRequestEmail";

const ALLOWED_STATUSES = new Set([
  "draft",
  "submitted",
  "under_review",
  "needs_information",
  "approved_for_build",
  "in_development",
  "client_review",
  "ready_to_launch",
  "launched",
  "cancelled",
]);

const NOTIFIABLE = new Set([
  "needs_information",
  "approved_for_build",
  "in_development",
  "client_review",
  "ready_to_launch",
  "launched",
]);

/**
 * POST /api/admin/website-requests/[id]/status
 * Body: { status, message? }
 *
 * Transitions the request status. Records a public activity entry so
 * the customer sees the change on their own view + optionally kicks a
 * notification email (idempotent per (request_id, status) inside
 * sendWebsiteRequestNotification).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const nextStatus = typeof body.status === "string" ? body.status : "";
  const message = typeof body.message === "string" ? body.message.slice(0, 1000) : "";

  if (!ALLOWED_STATUSES.has(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("website_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("website_requests")
    .update({ status: nextStatus, updated_at: nowIso })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("website_request_activity").insert({
    request_id: id,
    actor_id: adminId,
    event_type: "status_changed",
    visibility: "public",
    previous_status: existing.status,
    new_status: nextStatus,
    message: message || null,
  });

  if (NOTIFIABLE.has(nextStatus)) {
    try {
      await sendWebsiteRequestNotification({
        event: nextStatus as Parameters<typeof sendWebsiteRequestNotification>[0]["event"],
        request: updated,
      });
    } catch (e) {
      console.error("[admin.status] notification failed:", e);
    }
  }

  return NextResponse.json({ request: updated });
}
