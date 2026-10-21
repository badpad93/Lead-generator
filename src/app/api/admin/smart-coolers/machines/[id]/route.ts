import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { SMART_COOLER_BUCKET, machineImageUrl } from "@/lib/smartCoolerMachines";

const FIELDS = ["name", "bottles", "shelves", "cameras", "warranty", "starting_at", "active", "sort_order"];

function serialize(row: Record<string, unknown>) {
  return {
    ...row,
    image_url: machineImageUrl((row.image_path as string) ?? null, row.updated_at as string | null),
    spec_url: machineImageUrl((row.spec_path as string) ?? null, row.updated_at as string | null),
  };
}

/** PATCH /api/admin/smart-coolers/machines/[id] — update editable fields. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) updates[f] = body[f];

  const { data, error } = await supabaseAdmin
    .from("smart_cooler_machines")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ machine: serialize(data) });
}

/** DELETE /api/admin/smart-coolers/machines/[id] — remove the machine and its photo. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("image_path, spec_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("smart_cooler_machines").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const orphans = [row?.image_path, row?.spec_path].filter(Boolean) as string[];
  if (orphans.length > 0) {
    await supabaseAdmin.storage.from(SMART_COOLER_BUCKET).remove(orphans);
  }

  return NextResponse.json({ ok: true });
}
