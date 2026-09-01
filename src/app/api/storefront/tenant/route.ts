import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import {
  createTenant,
  resolveTenantByOwner,
  updateTenant,
  StorefrontTenantError,
  type TenantBrand,
  type TenantPublicPage,
} from "@/lib/storefront/tenants";

/**
 * Owner-scoped tenant CRUD.
 *   GET   -> return the tenant this operator owns (or 404).
 *   POST  -> create a tenant for this operator (fails if they already own one).
 *   PATCH -> update the operator's own tenant (branding, contact, public page).
 *            Approval / suspension / tier assignment go through admin routes.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ tenant: null }, { status: 404 });
  return NextResponse.json({ tenant });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    slug?: string;
    legal_name?: string;
    display_name?: string;
    subdomain?: string | null;
    primary_contact_name?: string;
    primary_contact_email?: string;
    primary_contact_phone?: string;
    support_email?: string;
    brand?: TenantBrand;
    public_page?: TenantPublicPage;
  };

  try {
    const tenant = await createTenant({
      ownerProfileId: userId,
      slug: (body.slug ?? "").toLowerCase().trim(),
      legalName: body.legal_name ?? "",
      displayName: body.display_name ?? "",
      subdomain: body.subdomain ?? null,
      primaryContactName: body.primary_contact_name ?? null,
      primaryContactEmail: body.primary_contact_email ?? null,
      primaryContactPhone: body.primary_contact_phone ?? null,
      supportEmail: body.support_email ?? null,
      brand: body.brand,
      publicPage: body.public_page,
      actorId: userId,
      actorRole: "operator",
    });
    return NextResponse.json({ tenant });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const own = await resolveTenantByOwner(userId);
  if (!own) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const allowed = [
    "display_name",
    "legal_name",
    "primary_contact_name",
    "primary_contact_email",
    "primary_contact_phone",
    "support_email",
    "brand",
    "public_page",
  ];
  for (const k of allowed) if (k in body) patch[k] = body[k];

  try {
    const updated = await updateTenant({
      tenantId: own.id,
      patch,
      actorId: userId,
      actorRole: "operator",
      auditAction:
        "brand" in patch || "public_page" in patch
          ? "tenant.branding_updated"
          : "tenant.contact_updated",
    });
    return NextResponse.json({ tenant: updated });
  } catch (err) {
    return errorResponse(err);
  }
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof StorefrontTenantError) {
    const status =
      err.code === "SLUG_TAKEN" || err.code === "SUBDOMAIN_TAKEN" || err.code === "OWNER_HAS_TENANT"
        ? 409
        : err.code === "TENANT_NOT_FOUND"
          ? 404
          : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  console.error("[storefront/tenant] failed", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
