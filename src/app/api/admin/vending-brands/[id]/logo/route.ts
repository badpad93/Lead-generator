import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  BRAND_LOGO_BUCKET,
  BRAND_LOGO_ALLOWED_MIME,
  BRAND_LOGO_MAX_BYTES,
  brandLogoExtension,
  brandLogoUrl,
} from "@/lib/vendingBrands";

function validateLogo(file: unknown): { error: NextResponse } | { file: File } {
  if (!(file instanceof File)) {
    return { error: NextResponse.json({ error: "file is required" }, { status: 400 }) };
  }
  if (!BRAND_LOGO_ALLOWED_MIME.has(file.type)) {
    return { error: NextResponse.json({ error: "Please upload a PNG, JPEG, WebP, or SVG" }, { status: 415 }) };
  }
  if (file.size > BRAND_LOGO_MAX_BYTES) {
    return { error: NextResponse.json({ error: "Logo must be under 5MB" }, { status: 413 }) };
  }
  return { file };
}

/** PUT /api/admin/vending-brands/[id]/logo — upload/replace the brand logo. */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  const validated = validateLogo(form?.get("file"));
  if ("error" in validated) return validated.error;
  const file = validated.file;
  const mime = file.type;

  const { data: row } = await supabaseAdmin
    .from("vending_brands")
    .select("logo_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const key = `${id}/${Date.now()}${brandLogoExtension(mime)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BRAND_LOGO_BUCKET)
    .upload(key, buffer, { contentType: mime, upsert: false, cacheControl: "3600" });
  if (uploadErr) {
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  return commitLogo(id, key, (row as { logo_path?: string | null }).logo_path ?? null);
}

async function commitLogo(id: string, key: string, priorPath: string | null): Promise<NextResponse> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("vending_brands")
    .update({ logo_path: key, updated_at: updatedAt })
    .eq("id", id);
  if (error) {
    await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).remove([key]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (priorPath && priorPath !== key) {
    await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).remove([priorPath]);
  }
  return NextResponse.json({ ok: true, logo_url: brandLogoUrl(key, updatedAt) });
}

/** DELETE /api/admin/vending-brands/[id]/logo — clear the logo. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from("vending_brands")
    .select("logo_path")
    .eq("id", id)
    .maybeSingle();

  await supabaseAdmin
    .from("vending_brands")
    .update({ logo_path: null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (row?.logo_path) {
    await supabaseAdmin.storage.from(BRAND_LOGO_BUCKET).remove([row.logo_path]);
  }

  return NextResponse.json({ ok: true });
}
