import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** GET /api/runs/[id]/leads?limit=50&offset=0&search= */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");
  const search = url.searchParams.get("search") ?? "";

  let query = supabaseAdmin
    .from("leads")
    .select("*", { count: "exact" })
    .eq("run_id", id)
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(
      `business_name.ilike.%${search}%,industry.ilike.%${search}%,city.ilike.%${search}%,phone.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ leads: data ?? [], total: count ?? 0 });
}
