import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get("event_type") || "all";
  const status = searchParams.get("status") || "all";

  let query = supabaseAdmin
    .from("marketplace_notifications")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(200);
  if (eventType !== "all") query = query.eq("event_type", eventType);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}
