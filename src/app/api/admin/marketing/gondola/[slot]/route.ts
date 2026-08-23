import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  GONDOLA_ALLOWED_MIME,
  GONDOLA_BUCKET,
  GONDOLA_MAX_BYTES,
  isGondolaSlot,
} from "@/lib/marketingGondola";

/**
 * PUT /api/admin/marketing/gondola/[slot]
 *   multipart/form-data:
 *     file — the image (png/jpeg/webp, <= 15 MB)
 *
 * Admin-only. Uploads the file into the public 'marketing-gondola'
 * bucket, upserts marketing_gondola_images by slot, and removes the
 * previous storage object so we don't accumulate orphans. The
 * gondola component picks up the new image on the next
 * /api/marketing/gondola fetch — the response URL carries a
 * ?v=<epoch> cache-buster so viewers see the swap immediately.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slot: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slot } = await params;
  if (!isGondolaSlot(slot)) {
    return NextResponse.json({ error: "Unknown gondola slot" }, { status: 400 });
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data required" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  if (!GONDOLA_ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Use PNG, JPEG, or WebP.` },
      { status: 415 },
    );
  }
  if (file.size > GONDOLA_MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${GONDOLA_MAX_BYTES / (1024 * 1024)} MB limit.` },
      { status: 413 },
    );
  }

  const ext = extensionFromMime(mime);
  // Timestamped filename so successive uploads never collide inside
  // the CDN's URL cache — the previous object is removed below.
  const key = `${slot}/${Date.now()}${ext}`;

  // Defensive: if migration 153's bucket-insert didn't land in this
  // Supabase project, provision the public bucket here on first
  // upload so admins don't hit a raw "Bucket not found" error.
  const bucketReady = await ensureGondolaBucket();
  if (!bucketReady.ok) {
    return NextResponse.json(
      { error: bucketReady.error },
      { status: bucketReady.status },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(GONDOLA_BUCKET)
    .upload(key, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadErr) {
    // Surface bucket-not-found as an actionable message pointing at
    // the fix (migration 153) instead of the raw Storage SDK string.
    if (/bucket not found/i.test(uploadErr.message)) {
      return NextResponse.json(
        {
          error:
            "Storage bucket 'marketing-gondola' does not exist. " +
            "Run supabase/migrations/153_marketing_gondola.sql (or " +
            "the bucket INSERT it contains) in the Supabase SQL editor.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: prior } = await supabaseAdmin
    .from("marketing_gondola_images")
    .select("storage_path")
    .eq("slot", slot)
    .maybeSingle();

  const { data: row, error: upsertErr } = await supabaseAdmin
    .from("marketing_gondola_images")
    .upsert(
      {
        slot,
        storage_path: key,
        content_type: mime,
        uploaded_at: new Date().toISOString(),
        uploaded_by: adminId,
      },
      { onConflict: "slot" },
    )
    .select("slot, storage_path, uploaded_at")
    .single();

  if (upsertErr || !row) {
    // Roll back the storage upload so we don't leave an orphan.
    await supabaseAdmin.storage.from(GONDOLA_BUCKET).remove([key]).catch(() => {});
    // Surface missing-table as actionable — the other half of
    // migration 153 that may not have landed in this project.
    const raw = upsertErr?.message ?? "Failed to record upload";
    if (/relation .*marketing_gondola_images.* does not exist/i.test(raw)) {
      return NextResponse.json(
        {
          error:
            "Table 'marketing_gondola_images' does not exist. " +
            "Run supabase/migrations/153_marketing_gondola.sql in the Supabase SQL editor.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: raw }, { status: 500 });
  }

  if (prior?.storage_path && prior.storage_path !== key) {
    await supabaseAdmin.storage
      .from(GONDOLA_BUCKET)
      .remove([prior.storage_path])
      .catch(() => {
        /* orphaned old object is not fatal */
      });
  }

  const { data: pub } = supabaseAdmin.storage
    .from(GONDOLA_BUCKET)
    .getPublicUrl(row.storage_path);
  const v = new Date(row.uploaded_at).getTime();

  return NextResponse.json({
    ok: true,
    slot: row.slot,
    url: pub?.publicUrl ? `${pub.publicUrl}?v=${v}` : null,
    uploaded_at: row.uploaded_at,
  });
}

/**
 * DELETE /api/admin/marketing/gondola/[slot]
 *
 * Admin-only. Reverts a slot to its shipped placeholder SVG —
 * removes the storage object and the marketing_gondola_images row.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slot: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slot } = await params;
  if (!isGondolaSlot(slot)) {
    return NextResponse.json({ error: "Unknown gondola slot" }, { status: 400 });
  }

  const { data: prior } = await supabaseAdmin
    .from("marketing_gondola_images")
    .select("storage_path")
    .eq("slot", slot)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from("marketing_gondola_images")
    .delete()
    .eq("slot", slot);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (prior?.storage_path) {
    await supabaseAdmin.storage
      .from(GONDOLA_BUCKET)
      .remove([prior.storage_path])
      .catch(() => {
        /* orphaned old object is not fatal */
      });
  }

  return NextResponse.json({ ok: true, slot });
}

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/png":  return ".png";
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    default:           return "";
  }
}

/**
 * Idempotent bucket check. If the public 'marketing-gondola' bucket
 * isn't there (migration 153's storage.buckets insert didn't run,
 * or a fresh Supabase project spun up after that migration), create
 * it with public read. Returns a shape callers can turn straight
 * into an HTTP response on failure.
 */
async function ensureGondolaBucket(): Promise<
  { ok: true } | { ok: false; error: string; status: number }
> {
  const { data, error } = await supabaseAdmin.storage.getBucket(GONDOLA_BUCKET);
  if (data) return { ok: true };
  // getBucket returns error === null / data === null when absent on
  // some SDK versions; treat both as "missing" and try to create.
  if (error && !/not found/i.test(error.message)) {
    return { ok: false, error: error.message, status: 500 };
  }
  const { error: createErr } = await supabaseAdmin.storage.createBucket(
    GONDOLA_BUCKET,
    { public: true },
  );
  if (createErr && !/already exists/i.test(createErr.message)) {
    return {
      ok: false,
      error:
        `Could not provision the 'marketing-gondola' storage bucket: ${createErr.message}. ` +
        `Run supabase/migrations/153_marketing_gondola.sql in the Supabase SQL editor.`,
      status: 500,
    };
  }
  return { ok: true };
}
