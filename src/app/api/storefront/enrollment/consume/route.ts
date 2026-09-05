import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { consumeInvitation, EnrollmentError } from "@/lib/storefront/enrollment";
import { resolveTenantById } from "@/lib/storefront/tenants";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Consume an invitation token — one-shot enrollment.
 *
 * The signed-in user is stamped with the tenant link; the request MUST
 * be authenticated so the profile id comes from the session, not the
 * body (never trust client-provided profile ids on a permanent-link
 * write).
 */
export async function POST(req: NextRequest) {
  // Fail-closed kill switch. 503 (not 404): the caller has proven
  // they know a specific token, so hiding "the service is off" as
  // "not found" would be a lie they can trivially disprove.
  if (!(await isStorefrontFlagEnabled("storefront.enrollment_enabled"))) {
    return NextResponse.json(
      { error: "Storefront enrollment is temporarily unavailable" },
      { status: 503 },
    );
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { token?: string; quote_token?: string };
  if (!body.token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const ua = req.headers.get("user-agent");

  try {
    const result = await consumeInvitation({
      token: body.token,
      profileId: userId,
      source: "invitation",
      ipAddress: ip,
      userAgent: ua,
    });
    // Resolve the tenant once — the slug goes back to the caller so
    // the signup/auth-callback flow can land the new customer
    // directly on /coffee/o/{slug} without a dashboard hop, and the
    // same row feeds the best-effort welcome email below.
    let tenantSlug: string | null = null;
    try {
      const { data: profileRow } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .eq("id", userId)
        .maybeSingle();
      const profile = profileRow as { email: string | null; full_name: string | null } | null;
      const tenant = await resolveTenantById(result.tenantId);
      tenantSlug = tenant?.slug ?? null;
      if (profile?.email && tenant) {
        const { sendEnrollmentWelcomeEmail } = await import("@/lib/storefront/emails");
        void sendEnrollmentWelcomeEmail({
          tenant,
          to: profile.email,
          displayName: profile.full_name,
        });
      }
    } catch (err) {
      console.warn("[storefront/enrollment/consume] welcome email failed", err);
    }
    // Quote carry-through: a prospect who enrolled via a quote gets the
    // quoted tier assigned deterministically (token-verified, tenant-safe).
    if (body.quote_token) {
      try {
        const { assignTierFromQuoteOnEnroll } = await import("@/lib/storefront/quotes");
        await assignTierFromQuoteOnEnroll(body.quote_token, userId);
      } catch (err) {
        console.warn("[storefront/enrollment/consume] quote tier assignment failed", err);
      }
    }
    return NextResponse.json({ ok: true, tenant_slug: tenantSlug, ...result });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      const status =
        err.code === "PROFILE_NOT_FOUND"
          ? 404
          : err.code === "PROFILE_LINKED_TO_OTHER_TENANT"
            ? 409
            : err.code === "INVITATION_EXPIRED" ||
                err.code === "INVITATION_REVOKED" ||
                err.code === "INVITATION_ALREADY_USED"
              ? 410
              : err.code === "INVITATION_NOT_FOUND"
                ? 404
                : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[storefront/enrollment/consume] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
