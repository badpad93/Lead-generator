import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import { brandLogoUrl, slugify } from "@/lib/vendingBrands";

const FIELDS = ["blurb", "active", "sort_order"];

function serialize(row: Record<string, unknown>) {
  return { ...row, logo_url: brandLogoUrl((row.logo_path as string) ?? null, row.updated_at as string | null) };
}

function pickFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of FIELDS) if (f in body) out[f] = body[f];
  return out;
}

function writeError(error: { code?: string; message: string }): NextResponse {
  if (error.code === "23505") {
    return NextResponse.json({ error: "A brand with that slug already exists" }, { status: 409 });
  }
  return NextResponse.json({ error: error.message }, { status: 500 });
}

/** GET /api/admin/vending-brands — all brands (admin), ordered. */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("vending_brands")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ brands: (data || []).map(serialize) });
}

/** POST /api/admin/vending-brands — create a brand. */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string)?.trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const insert = pickFields(body);
  insert.name = name;
  insert.slug = slugify((body.slug as string) || name) || `brand-${Date.now()}`;

  const { data, error } = await supabaseAdmin
    .from("vending_brands")
    .insert(insert)
    .select("*")
    .single();
  if (error) return writeError(error);

  return NextResponse.json({ brand: serialize(data) }, { status: 201 });
}
