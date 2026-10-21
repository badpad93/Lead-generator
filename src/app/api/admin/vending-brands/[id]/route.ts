import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { BRAND_LOGO_BUCKET, brandLogoUrl, slugify } from "@/lib/vendingBrands";

const FIELDS = ["name", "blurb", "active", "sort_order"];

function serialize(row: Record<string, unknown>) {
  return { ...row, logo_url: brandLogoUrl((row.logo_path as string) ?? null, row.updated_at as string | null) };
}

/** PATCH /api/admin/vending-brands/[id] — update editable fields. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) if (f in body) updates[f] = body[f];
  if (typeof body.slug === "string") updates.slug = slugify(body.slug);

  const { data, error } = await supabaseAdmin
    .from("vending_brands")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    const msg = error.code === "23505" ? "A brand with that slug already exists" : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === "23505" ? 409 : 500 });
  }

  return NextResponse.json({ brand: serialize(data) });
}

/** DELETE /api/admin/vending-brands/[id] — remove the brand (machines unassign via FK) and its logo. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("vending_brands")
    .select("logo_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin.from("vending_brands").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (row?.logo_path) {
    await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).remove([row.logo_path]);
  }

  return NextResponse.json({ ok: true });
}
