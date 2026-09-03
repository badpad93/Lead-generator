import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { consumeInvitation, EnrollmentError } from "@/lib/storefront/enrollment";
import { resolveTenantById } from "@/lib/storefront/tenants";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * POST /api/storefront/enrollment/claim-by-email
 *
 * Server-side enrollment fallback that needs NO invite token from
 * the browser. The invite-token stash rides on localStorage +
 * short-lived cookies through signup → verify → login, and any
 * loss along the way (OAuth redirect, different browser, privacy
 * mode, >10-minute gap) used to strand the tenant on the generic
 * flow. This endpoint closes that hole for email-addressed
 * invitations:
 *
 *   The signed-in user's OWN email is matched against pending
 *   invitations. Authenticating as that email is proof the invite
 *   was addressed to them, so the newest valid match is consumed
 *   exactly as if they'd clicked the link.
 *
 * Link-only invitations (no email captured) still require the
 * token — nothing to match against.
 *
 * Responses:
 *   { ok: true, tenant_slug, already: true }  — profile already
 *     enrolled; slug returned so callers can redirect.
 *   { ok: true, tenant_slug }                 — claimed now.
 *   404 NO_INVITATION                         — nothing pending for
 *     this email; caller proceeds with its normal flow.
 */
export async function POST(req: NextRequest) {
  if (!(await isStorefrontFlagEnabled("storefront.enrollment_enabled"))) {
    return NextResponse.json(
      { error: "Storefront enrollment is temporarily unavailable" },
      { status: 503 },
    );
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("id, email, storefront_tenant_id")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileRow as {
    id: string;
    email: string | null;
    storefront_tenant_id: string | null;
  } | null;
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Already enrolled — hand back the slug so the caller can land
  // the customer on their storefront.
  if (profile.storefront_tenant_id) {
    const tenant = await resolveTenantById(profile.storefront_tenant_id);
    return NextResponse.json({
      ok: true,
      already: true,
      tenant_slug: tenant?.slug ?? null,
    });
  }

  const email = (profile.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "No email on profile", code: "NO_INVITATION" },
      { status: 404 },
    );
  }

  const nowIso = new Date().toISOString();
  const { data: invRow } = await supabaseAdmin
    .from("storefront_invitations")
    .select("token, tenant_id")
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const invitation = invRow as { token: string; tenant_id: string } | null;
  if (!invitation) {
    return NextResponse.json(
      { error: "No pending invitation for this email", code: "NO_INVITATION" },
      { status: 404 },
    );
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  try {
    const result = await consumeInvitation({
      token: invitation.token,
      profileId: userId,
      source: "email_claim",
      ipAddress: forwardedFor ? forwardedFor.split(",")[0].trim() : null,
      userAgent: req.headers.get("user-agent"),
    });
    const tenant = await resolveTenantById(result.tenantId);
    return NextResponse.json({ ok: true, tenant_slug: tenant?.slug ?? null });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 409 });
    }
    console.error("[storefront/claim-by-email] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
