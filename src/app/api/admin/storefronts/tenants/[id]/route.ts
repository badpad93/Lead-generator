import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import {
  approveTenant,
  suspendTenant,
  closeTenant,
  assignPricingTier,
  assignOwner,
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
 *   { action: "assign_owner", owner_profile_id: string, reason?: string }
 *   { patch: {...} }   generic tenant patch (branding, contact, tax_status, w9_*, qb_*)
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const tenant = await resolveTenantById(id);
  if (!tenant) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Owner profile for display in the console (name/email next to
  // the reassignment picker).
  let owner: { id: string; full_name: string | null; email: string | null } | null = null;
  try {
    const { supabaseAdmin } = await import("@/lib/supabaseAdmin");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", tenant.owner_profile_id)
      .maybeSingle();
    owner = (data as typeof owner) ?? null;
  } catch {
    // Non-fatal — the console renders the raw id if the join fails.
  }
  return NextResponse.json({ tenant, owner });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "approve" | "suspend" | "close" | "assign_tier" | "assign_owner";
    reason?: string;
    base_pricing_tier_id?: string | null;
    owner_profile_id?: string;
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
      if (tenant.primary_contact_email) {
        const { sendTenantSuspendedNotice } = await import("@/lib/storefront/emails");
        void sendTenantSuspendedNotice({
          tenant,
          to: tenant.primary_contact_email,
          reason: body.reason,
        });
      }
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
    if (body.action === "assign_owner") {
      if (!body.owner_profile_id) {
        return NextResponse.json({ error: "owner_profile_id required" }, { status: 400 });
      }
      const tenant = await assignOwner({
        tenantId: id,
        ownerProfileId: body.owner_profile_id,
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
      const status =
        err.code === "TENANT_NOT_FOUND"
          ? 404
          : err.code === "OWNER_HAS_TENANT"
            ? 409
            : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[admin/storefronts/tenants] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
