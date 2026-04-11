import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/machines/[id]
 * Accepts either a UUID or a slug so the /machines/[id] page can
 * use friendly URLs like /machines/apex-combo-3000.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const query = supabaseAdmin
    .from("machines")
    .select("*")
    .eq("active", true)
    .limit(1);

  const { data, error } = await (isUuid
    ? query.eq("id", id)
    : query.eq("slug", id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Machine not found" }, { status: 404 });
  }
  return NextResponse.json({ machine: data[0] });
}
