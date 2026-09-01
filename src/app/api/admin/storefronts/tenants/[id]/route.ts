import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  approveTenant,
  suspendTenant,
  closeTenant,
  assignPricingTier,
  updateTenant,
  resolveTenantById,
  StorefrontTenantError,
} from "@/lib/storefront/tenants";

/**
 * Admin: single-tenant read + status transitions + tier assignment.
 *
 * PATCH body may carry one of:
 *   { action: "approve",   reason?: string }
 *   { action: "suspend",   reason: string }
 *   { action: "close",     reason?: string }
 *   { action: "assign_tier", base_pricing_tier_id: string | null, reason?: string }
 *   { patch: {...} }   generic tenant patch (branding, contact, tax_status, w9_*, qb_*)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const tenant = await resolveTenantById(id);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ tenant });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "approve" | "suspend" | "close" | "assign_tier";
    reason?: string;
    base_pricing_tier_id?: string | null;
    patch?: Record<string, unknown>;
  };

  try {
    if (body.action === "approve") {
      const tenant = await approveTenant({
        tenantId: id,
        actorId: adminId,
        actorRole: "admin",
        reason: body.reason ?? null,
      });
      return NextResponse.json({ tenant });
    }
    if (body.action === "suspend") {
      if (!body.reason) {
        return NextResponse.json({ error: "reason required" }, { status: 400 });
      }
      const tenant = await suspendTenant({
        tenantId: id,
        actorId: adminId,
        actorRole: "admin",
        reason: body.reason,
      });
      return NextResponse.json({ tenant });
    }
    if (body.action === "close") {
      const tenant = await closeTenant({
        tenantId: id,
        actorId: adminId,
        actorRole: "admin",
        reason: body.reason ?? null,
      });
      return NextResponse.json({ tenant });
    }
    if (body.action === "assign_tier") {
      const tenant = await assignPricingTier({
        tenantId: id,
        basePricingTierId: body.base_pricing_tier_id ?? null,
        actorId: adminId,
        actorRole: "admin",
        reason: body.reason ?? null,
      });
      return NextResponse.json({ tenant });
    }
    if (body.patch) {
      const tenant = await updateTenant({
        tenantId: id,
        patch: body.patch,
        actorId: adminId,
        actorRole: "admin",
        auditAction:
          "tax_status" in body.patch || "w9_submitted_at" in body.patch || "w9_approved_at" in body.patch
            ? "tenant.tax_updated"
            : "tenant.branding_updated",
        reason: body.reason ?? null,
      });
      return NextResponse.json({ tenant });
    }
    return NextResponse.json({ error: "action or patch required" }, { status: 400 });
  } catch (err) {
    if (err instanceof StorefrontTenantError) {
      const status = err.code === "TENANT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[admin/storefronts/tenants] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
