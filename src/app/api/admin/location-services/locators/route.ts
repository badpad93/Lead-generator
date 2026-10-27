import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { headshotUrl } from "@/lib/locationServices";

const FIELDS = ["name", "headline", "bio", "region", "email", "phone", "hourly_rate_cents", "active", "sort_order"];

function serialize(row: Record<string, unknown>) {
  return { ...row, headshot_url: headshotUrl((row.headshot_path as string) ?? null, row.updated_at as string | null) };
}

function pickFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) out[f] = body[f];
  return out;
}

async function nextSortOrder(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("location_service_locators")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 1;
}

/** GET /api/admin/location-services/locators — all locator profiles, ordered. */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("location_service_locators")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locators: (data || []).map(serialize) });
}

/** POST /api/admin/location-services/locators — create a locator profile. */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const insert = pickFields(body);
  insert.name = body.name.trim();
  if (insert.sort_order == null) insert.sort_order = await nextSortOrder();

  const { data, error } = await supabaseAdmin
    .from("location_service_locators")
    .insert(insert)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locator: serialize(data) }, { status: 201 });
}
