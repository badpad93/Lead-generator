import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/machine-listings/process-image
 * -----------------------------------------------------------
 * Server-side image processing for machine-listing uploads.
 *
 * Flow:
 *  1. Client uploads the raw image directly to Supabase Storage
 *     at a staging path under:
 *       machine-listings/{user_id}/_staging/{uuid}.{ext}
 *     (Direct upload bypasses the Vercel request body limit.)
 *
 *  2. Client POSTs this endpoint with { stagingPath }.
 *
 *  3. We download the staged file via the service-role client,
 *     resize with sharp into four WebP versions (thumb/medium/
 *     main/original), upload them to a final folder:
 *       machine-listings/{user_id}/{upload_uuid}/{name}.webp
 *     and delete the staging file.
 *
 *  4. We return the public URLs + a stable upload_uuid.
 *
 * The staging-path prefix check ensures a user can only process
 * files they uploaded themselves.
 *
 * PDFs never touch this endpoint — they're stored unchanged in
 * the same bucket and listed in machine_listings.photos.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Give the handler more time on Vercel Pro; a no-op on Hobby.
export const maxDuration = 60;

const BUCKET = "documents";
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB — generous; client caps at 10 MB

type SizeName = "thumb" | "medium" | "main" | "original";

const SIZES: { name: SizeName; width: number; quality: number }[] = [
  { name: "thumb", width: 300, quality: 78 },
  { name: "medium", width: 800, quality: 78 },
  { name: "main", width: 1200, quality: 80 },
  // "original" is an archival copy, format-converted to WebP and capped
  // at 2400w so we don't store multi-megapixel camera originals forever.
  { name: "original", width: 2400, quality: 85 },
];

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { stagingPath?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const stagingPath =
    typeof body.stagingPath === "string" ? body.stagingPath.trim() : "";
  const requiredPrefix = `machine-listings/${userId}/_staging/`;
  if (!stagingPath || !stagingPath.startsWith(requiredPrefix)) {
    return json({ error: "Invalid staging path" }, 400);
  }

  // 1. Download the staged file
  const download = await supabaseAdmin.storage.from(BUCKET).download(stagingPath);
  if (download.error || !download.data) {
    return json(
      {
        error: `Could not read staged file: ${download.error?.message ?? "not found"}`,
      },
      400
    );
  }

  const arrayBuffer = await download.data.arrayBuffer();
  const input = Buffer.from(arrayBuffer);

  if (input.length > MAX_BYTES) {
    await supabaseAdmin.storage.from(BUCKET).remove([stagingPath]);
    return json({ error: "Image exceeds 20 MB" }, 413);
  }

  // 2. Validate that sharp can read it as an image
  let metadata: sharp.Metadata;
  try {
    metadata = await sharp(input).metadata();
  } catch {
    await supabaseAdmin.storage.from(BUCKET).remove([stagingPath]);
    return json({ error: "File is not a valid image" }, 400);
  }

  // 3. Generate versions
  const uploadId = randomUUID();
  const baseFolder = `machine-listings/${userId}/${uploadId}`;

  // Auto-rotate based on EXIF, then clone() per size so we share the
  // decoded pixels across all four pipelines.
  const basePipeline = sharp(input).rotate();

  const uploaded: Partial<Record<SizeName, string>> = {};

  try {
    for (const size of SIZES) {
      const needsResize = !metadata.width || metadata.width > size.width;
      const transformer = needsResize
        ? basePipeline
            .clone()
            .resize({ width: size.width, withoutEnlargement: true })
        : basePipeline.clone();

      const buffer = await transformer
        .webp({ quality: size.quality, effort: 4 })
        .toBuffer();

      const path = `${baseFolder}/${size.name}.webp`;
      const { error: uploadErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, {
          upsert: false,
          contentType: "image/webp",
          cacheControl: "31536000", // 1 year — URLs include a fresh upload_uuid
        });
      if (uploadErr) {
        throw new Error(
          `Upload failed for ${size.name}.webp: ${uploadErr.message}`
        );
      }

      const { data: urlData } = supabaseAdmin.storage
        .from(BUCKET)
        .getPublicUrl(path);
      uploaded[size.name] = urlData.publicUrl;
    }
  } catch (err) {
    // Cleanup: delete anything we managed to upload + the staging file
    const cleanupPaths = Object.keys(uploaded).map(
      (n) => `${baseFolder}/${n}.webp`
    );
    if (cleanupPaths.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(cleanupPaths);
    }
    await supabaseAdmin.storage.from(BUCKET).remove([stagingPath]);
    return json(
      { error: err instanceof Error ? err.message : "Processing failed" },
      500
    );
  }

  // 4. Delete staging file — processed versions are authoritative
  await supabaseAdmin.storage.from(BUCKET).remove([stagingPath]);

  return json({
    uploadId,
    thumbUrl: uploaded.thumb!,
    mediumUrl: uploaded.medium!,
    mainUrl: uploaded.main!,
    originalUrl: uploaded.original!,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
  });
}
