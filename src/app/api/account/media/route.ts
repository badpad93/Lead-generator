import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Account media — upload / remove an avatar or business logo on the
 * authenticated user's profile.
 *
 *   POST   /api/account/media   multipart body: { file, type }
 *   DELETE /api/account/media?type=avatar|logo
 *
 * The bucket is public-read so URLs can drop straight into <img>. All
 * writes flow through here so the server (running as service_role)
 * owns per-user auth and cleanup of the previous file.
 */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);
const BUCKET = "profile-media";
const COL_BY_TYPE = { avatar: "avatar_url", logo: "logo_url" } as const;
type MediaType = keyof typeof COL_BY_TYPE;

async function getUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id ?? null;
}

function extForMime(mime: string): string {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg":
    case "image/jpg": return "jpg";
    case "image/webp": return "webp";
    case "image/gif": return "gif";
    case "image/svg+xml": return "svg";
    default: return "bin";
  }
}

// Extract the object path from a public storage URL so we can delete
// the previous file when a new one lands. Best-effort — a broken URL
// just skips cleanup rather than failing the whole upload.
function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return url.slice(i + marker.length);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = form.get("file");
  const typeRaw = form.get("type");
  const type = typeof typeRaw === "string" ? (typeRaw as MediaType) : null;

  if (!type || !(type in COL_BY_TYPE)) {
    return NextResponse.json({ error: "type must be 'avatar' or 'logo'" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File exceeds ${MAX_BYTES / 1024 / 1024}MB limit` }, { status: 413 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type ${file.type}. Use PNG, JPG, WebP, GIF, or SVG.` },
      { status: 415 },
    );
  }

  const ext = extForMime(file.type);
  // Timestamp keeps CDN caches from serving the old image after an
  // upload; the previous file is deleted below.
  const path = `${userId}/${type}-${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  const publicUrl = publicData.publicUrl;

  // Grab the previous URL BEFORE writing so we can delete the old
  // object after the profile update succeeds.
  const column = COL_BY_TYPE[type];
  const { data: prev } = await supabaseAdmin
    .from("profiles")
    .select(column)
    .eq("id", userId)
    .maybeSingle();
  const previousUrl = (prev as Record<string, string | null> | null)?.[column] ?? null;

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ [column]: publicUrl })
    .eq("id", userId);
  if (updateError) {
    // Roll back the upload so we don't leave orphaned objects.
    await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Delete the previous file (fire-and-forget — the profile is
  // already pointing at the new one, so leftover storage is cosmetic).
  const previousPath = pathFromPublicUrl(previousUrl);
  if (previousPath && previousPath !== path) {
    supabaseAdmin.storage.from(BUCKET).remove([previousPath]).catch(() => {});
  }

  return NextResponse.json({ ok: true, type, url: publicUrl });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const typeRaw = new URL(req.url).searchParams.get("type");
  const type = typeRaw as MediaType | null;
  if (!type || !(type in COL_BY_TYPE)) {
    return NextResponse.json({ error: "type must be 'avatar' or 'logo'" }, { status: 400 });
  }

  const column = COL_BY_TYPE[type];
  const { data: prev } = await supabaseAdmin
    .from("profiles")
    .select(column)
    .eq("id", userId)
    .maybeSingle();
  const previousUrl = (prev as Record<string, string | null> | null)?.[column] ?? null;

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update({ [column]: null })
    .eq("id", userId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const previousPath = pathFromPublicUrl(previousUrl);
  if (previousPath) {
    supabaseAdmin.storage.from(BUCKET).remove([previousPath]).catch(() => {});
  }

  return NextResponse.json({ ok: true, type });
}
