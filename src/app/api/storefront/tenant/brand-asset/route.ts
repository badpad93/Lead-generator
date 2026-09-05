import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getAdminUserId } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  resolveTenantById,
  resolveTenantByOwner,
} from "@/lib/storefront/tenants";
import { recordAuditEvent } from "@/lib/storefront/audit";

/**
 * POST /api/storefront/tenant/brand-asset
 *   multipart/form-data:
 *     file        — the image (see ALLOWED_MIME below)
 *     asset_type  — "logo" | "favicon"
 *     tenant_id   — required ONLY for admin callers (owner uses their own)
 *
 * Uploads to the public 'storefront-brand' Supabase Storage bucket
 * and returns the public URL. Does NOT patch the tenant.brand JSON
 * itself — the client (BrandEditor) receives the URL and includes
 * it in the next Save via the existing PATCH /api/storefront/tenant
 * or PATCH /api/admin/storefronts/tenants/[id] flow. This split
 * keeps the upload path idempotent (retry a failed upload without
 * a mid-flight tenant edit) and lets the operator preview the new
 * URL before committing.
 *
 * Authorization:
 *   Owner:  session profile owns the tenant → tenant_id inferred
 *           from resolveTenantByOwner; a `tenant_id` in the form
 *           body is ignored for owners.
 *   Admin:  getAdminUserId passes → tenant_id must be in the form
 *           body and refer to an existing tenant.
 *   Otherwise → 403.
 *
 * File constraints:
 *   Logo    — PNG, JPEG, WEBP, SVG (2 MB cap)
 *   Favicon — PNG, ICO, JPEG, SVG (500 KB cap — favicons are tiny;
 *             larger uploads are almost certainly the wrong image)
 *
 * SVG accepted for both; parked here as a trust decision — the
 * upload API is authorized (owner OR admin), so we accept the
 * theoretical XSS surface from an SVG's inline scripts. If we
 * later expose upload to broader users we should DOMPurify the SVG
 * server-side before storing.
 */

const LOGO_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);
const FAVICON_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const FAVICON_MAX_BYTES = 512 * 1024;
const BUCKET = "storefront-brand";

function extensionFromMime(mime: string): string {
  switch (mime) {
    case "image/png": return ".png";
    case "image/jpeg": return ".jpg";
    case "image/webp": return ".webp";
    case "image/svg+xml": return ".svg";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return ".ico";
    default:
      return "";
  }
}

async function ensureBucket(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (data) return { ok: true };
  if (error && !/not found/i.test(error.message)) {
    return { ok: false, error: error.message };
  }
  const { error: createErr } = await supabaseAdmin.storage.createBucket(BUCKET, {
    public: true,
  });
  if (createErr && !/already exists/i.test(createErr.message)) {
    return {
      ok: false,
      error: `Could not provision '${BUCKET}' bucket: ${createErr.message}. Run migration 175 in Supabase.`,
    };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminId = await getAdminUserId(req);

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "multipart/form-data required" },
      { status: 400 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const assetTypeRaw = form.get("asset_type");
  const requestedTenantId = form.get("tenant_id");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (assetTypeRaw !== "logo" && assetTypeRaw !== "favicon") {
    return NextResponse.json(
      { error: "asset_type must be 'logo' or 'favicon'" },
      { status: 400 },
    );
  }
  const assetType = assetTypeRaw as "logo" | "favicon";

  // Authorization: figure out which tenant this write targets.
  //
  // Order matters. An admin who ALSO owns a storefront uploads a logo
  // from their OWN storefront brand editor, which (correctly) sends no
  // tenant_id. The old order checked adminId FIRST and demanded a
  // tenant_id the owner UI never sends, so admin-owners couldn't upload
  // their own logo. Resolve as an admin acting on another tenant only
  // when a tenant_id was explicitly supplied; otherwise fall back to
  // the caller's own tenant.
  let tenantId: string;
  let actorRole: "operator" | "admin";
  const explicitTenantId =
    typeof requestedTenantId === "string" && requestedTenantId ? requestedTenantId : null;

  if (adminId && explicitTenantId) {
    const t = await resolveTenantById(explicitTenantId);
    if (!t) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    tenantId = t.id;
    actorRole = "admin";
  } else {
    const owned = await resolveTenantByOwner(userId);
    if (owned) {
      tenantId = owned.id;
      actorRole = adminId ? "admin" : "operator";
    } else if (adminId) {
      return NextResponse.json(
        { error: "tenant_id form field required for admin uploads" },
        { status: 400 },
      );
    } else {
      return NextResponse.json(
        { error: "No tenant owned by this account" },
        { status: 403 },
      );
    }
  }

  const mime = file.type || "application/octet-stream";
  const allowed = assetType === "logo" ? LOGO_ALLOWED_MIME : FAVICON_ALLOWED_MIME;
  if (!allowed.has(mime)) {
    const list = Array.from(allowed).join(", ");
    return NextResponse.json(
      { error: `Unsupported file type: ${mime}. Allowed: ${list}` },
      { status: 415 },
    );
  }
  const cap = assetType === "logo" ? LOGO_MAX_BYTES : FAVICON_MAX_BYTES;
  if (file.size > cap) {
    return NextResponse.json(
      { error: `File exceeds ${Math.round(cap / 1024)} KB limit for ${assetType}` },
      { status: 413 },
    );
  }

  const bucketReady = await ensureBucket();
  if (!bucketReady.ok) {
    return NextResponse.json({ error: bucketReady.error }, { status: 500 });
  }

  const ext = extensionFromMime(mime);
  const key = `${tenantId}/${assetType}-${Date.now()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(key, buffer, {
      contentType: mime,
      upsert: false,
      cacheControl: "3600",
    });
  if (uploadErr) {
    if (/bucket not found/i.test(uploadErr.message)) {
      return NextResponse.json(
        {
          error:
            `Storage bucket '${BUCKET}' does not exist. Run supabase/migrations/175_storefront_brand_assets_bucket.sql.`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(key);
  const publicUrl = pub?.publicUrl ?? null;
  if (!publicUrl) {
    return NextResponse.json({ error: "Failed to resolve public URL" }, { status: 500 });
  }

  // Audit the upload. The subsequent tenant PATCH will emit its
  // own tenant.branding_updated event when the URL is saved into
  // brand.logo_url; this event captures the upload itself so an
  // orphan upload (never saved into brand) is still traceable.
  await recordAuditEvent({
    tenantId,
    actorId: actorRole === "admin" ? adminId : userId,
    actorRole,
    action: "tenant.branding_updated",
    entityType: "storefront_tenant",
    entityId: tenantId,
    after: { uploaded_asset: assetType, storage_key: key, url: publicUrl, mime, bytes: file.size },
    reason: `Uploaded ${assetType} (${mime}, ${file.size} bytes)`,
  });

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    storage_key: key,
    asset_type: assetType,
    mime,
    bytes: file.size,
  });
}
