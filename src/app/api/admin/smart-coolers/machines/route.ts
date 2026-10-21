import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { machineImageUrl } from "@/lib/smartCoolerMachines";

const FIELDS = ["name", "bottles", "shelves", "cameras", "warranty", "starting_at", "active", "sort_order"];

function serialize(row: Record<string, unknown>) {
  return {
    ...row,
    image_url: machineImageUrl((row.image_path as string) ?? null, row.updated_at as string | null),
    spec_url: machineImageUrl((row.spec_path as string) ?? null, row.updated_at as string | null),
  };
}

function pickFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) out[f] = body[f];
  return out;
}

async function nextSortOrder(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 1;
}

/** GET /api/admin/smart-coolers/machines — all machines (admin), ordered. */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ machines: (data || []).map(serialize) });
}

/** POST /api/admin/smart-coolers/machines — create a machine. */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const insert = pickFields(body);
  insert.name = body.name.trim();
  if (insert.sort_order == null) insert.sort_order = await nextSortOrder();

  const { data, error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .insert(insert)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ machine: serialize(data) }, { status: 201 });
}
