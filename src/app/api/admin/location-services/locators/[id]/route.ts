import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { LOCATOR_BUCKET, headshotUrl } from "@/lib/locationServices";

const FIELDS = ["name", "headline", "bio", "region", "email", "phone", "hourly_rate_cents", "active", "sort_order"];

function serialize(row: Record<string, unknown>) {
  return { ...row, headshot_url: headshotUrl((row.headshot_path as string) ?? null, row.updated_at as string | null) };
}

/** PATCH /api/admin/location-services/locators/[id] — update editable fields. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) updates[f] = body[f];

  const { data, error } = await supabaseAdmin
    .from("location_service_locators")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ locator: serialize(data) });
}

/** DELETE /api/admin/location-services/locators/[id] — remove the profile + headshot. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("location_service_locators")
    .select("headshot_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("location_service_locators").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row?.headshot_path) {
    await supabaseAdmin.storage.from(LOCATOR_BUCKET).remove([row.headshot_path as string]);
  }

  return NextResponse.json({ ok: true });
}
