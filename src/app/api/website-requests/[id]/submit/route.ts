import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { validateSubmit } from "@/lib/websiteRequests";
import { sendWebsiteRequestNotification } from "@/lib/websiteRequestEmail";

/**
 * POST /api/website-requests/[id]/submit
 *
 * Flip a draft (or a needs_information response) into `submitted`. Runs
 * server-side validation of the minimum required fields + content
 * ownership acknowledgment. On success, fires customer confirmation +
 * admin notification.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from("website_requests")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status !== "draft" && existing.status !== "needs_information") {
    return NextResponse.json({ error: `Cannot submit from status "${existing.status}"` }, { status: 409 });
  }

  const validation = validateSubmit(existing);
  if (!validation.ok) {
    return NextResponse.json(
      { error: "Missing required fields", missing: validation.missing },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("website_requests")
    .update({
      status: "submitted",
      submitted_at: existing.submitted_at || nowIso,
      updated_at: nowIso,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("website_request_activity").insert({
    request_id: id,
    actor_id: userId,
    event_type: "submitted",
    visibility: "public",
    previous_status: existing.status,
    new_status: "submitted",
    message: existing.status === "needs_information"
      ? "Resubmitted with additional information"
      : "Submitted for review",
  });

  // Fire-and-forget notifications; a Resend failure shouldn't block the submit.
  try {
    await sendWebsiteRequestNotification({
      event: "submitted",
      request: updated,
    });
  } catch (e) {
    console.error("[website-request.submit] notification failed:", e);
  }

  // Spawn website_build workflow. Best-effort — never blocks the submit.
  try {
    const { spawnFromWebsiteRequest } = await import("@/lib/workflows/hooks");
    await spawnFromWebsiteRequest(id, {
      customerId: userId,
      siteName: (updated as { business_name?: string }).business_name,
    });
  } catch (e) {
    console.error("[website-request.submit] workflow spawn failed:", e);
  }

  return NextResponse.json({ ok: true, request: updated });
}
