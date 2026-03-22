import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/** GET /api/requests/[id] — get a single vending request */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Determine requester identity — try Bearer token first, then cookies
  let requesterId = await getUserIdFromRequest(req);
  if (!requesterId) {
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll() {},
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      requesterId = user?.id ?? null;
    } catch {
      // Continue as unauthenticated
    }
  }

  let requesterRole: string | null = null;
  if (requesterId) {
    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", requesterId)
      .single();
    requesterRole = requesterProfile?.role ?? null;
  }
  const isOperator = requesterRole === "operator";

  // Increment view count (best-effort)
  try {
    const { data: cur } = await supabaseAdmin.from("vending_requests").select("views").eq("id", id).single();
    if (cur) await supabaseAdmin.from("vending_requests").update({ views: (cur.views || 0) + 1 }).eq("id", id);
  } catch { /* ignore */ }

  const { data, error } = await supabaseAdmin
    .from("vending_requests")
    .select("*, profiles!created_by(id, full_name, company_name, verified, city, state, rating, review_count)")
    .eq("id", id)
    .neq("city", "").neq("state", "").not("city", "is", null).not("state", "is", null)
    .neq("city", "Unknown").neq("state", "Unknown").neq("city", "unknown").neq("state", "unknown")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Block access to purchased leads unless the viewer is the buyer or the owner
  if (!data.is_public || data.status === "matched") {
    const isOwner = requesterId && requesterId === data.created_by;

    // Check if the requester is the buyer
    let isBuyer = false;
    if (requesterId) {
      const { data: purchase } = await supabaseAdmin
        .from("lead_purchases")
        .select("id")
        .eq("user_id", requesterId)
        .eq("request_id", id)
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();
      isBuyer = !!purchase;
    }

    if (!isOwner && !isBuyer) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
  }

  // Strip location data for operator accounts (only show business industry + zip)
  if (isOperator) {
    return NextResponse.json({
      ...data,
      location_name: "Location",
      address: null,
      city: null,
      description: null,
      contact_preference: null,
      profiles: null,
    });
  }

  return NextResponse.json(data);
}

/** PATCH /api/requests/[id] — update request status (owner only) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { status } = body;

  if (!status || !["open", "matched", "closed"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Must be open, matched, or closed." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("vending_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });
  }

  return NextResponse.json(data);
}

/** DELETE /api/requests/[id] — delete a request (owner only) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id");
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("vending_requests")
    .delete()
    .eq("id", id)
    .eq("created_by", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
