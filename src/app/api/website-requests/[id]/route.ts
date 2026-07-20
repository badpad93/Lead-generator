import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { sanitizeCustomerPatch, signedMediaUrl } from "@/lib/websiteRequests";

/**
 * GET /api/website-requests/[id]   — own draft/request + media + public activity
 * PATCH /api/website-requests/[id] — save/autosave (only customer-editable fields)
 * DELETE /api/website-requests/[id] — delete own DRAFT only; submitted requests
 *                                     cannot be deleted (customer requests
 *                                     cancellation from admin instead).
 */

async function ownedRequest(userId: string, id: string) {
  const { data } = await supabaseAdmin
    .from("website_requests")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const request = await ownedRequest(userId, id);
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: media }, { data: activity }] = await Promise.all([
    supabaseAdmin
      .from("website_request_media")
      .select("*")
      .eq("request_id", id)
      .order("sort_order"),
    supabaseAdmin
      .from("website_request_activity")
      .select("*")
      .eq("request_id", id)
      .eq("visibility", "public")
      .order("created_at", { ascending: false }),
  ]);

  // Sign urls for media so private assets can render in the wizard
  const mediaWithUrls = await Promise.all(
    (media || []).map(async (m) => ({
      ...m,
      signed_url: m.file_path ? await signedMediaUrl(m.file_path) : null,
    })),
  );

  return NextResponse.json({
    request,
    media: mediaWithUrls,
    activity: activity || [],
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await ownedRequest(userId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Once submitted, the customer can't silently edit — they'd need admin
  // to switch it back to draft or to Needs Information.
  if (existing.status !== "draft" && existing.status !== "needs_information") {
    return NextResponse.json(
      { error: "Request is no longer editable. Contact support to make changes." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const patch = sanitizeCustomerPatch(body);
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No editable fields in body" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("website_requests")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ request: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const existing = await ownedRequest(userId, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json(
      { error: "Only drafts can be deleted. Request cancellation from support instead." },
      { status: 409 },
    );
  }

  await supabaseAdmin.from("website_requests").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
