import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/requests/[id] — get a single vending request */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Increment view count (best-effort)
  try {
    const { data: cur } = await supabaseAdmin.from("vending_requests").select("views").eq("id", id).single();
    if (cur) await supabaseAdmin.from("vending_requests").update({ views: (cur.views || 0) + 1 }).eq("id", id);
  } catch { /* ignore */ }

  const { data, error } = await supabaseAdmin
    .from("vending_requests")
    .select("*, profiles!created_by(id, full_name, avatar_url, company_name, verified, city, state, rating, review_count)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
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
