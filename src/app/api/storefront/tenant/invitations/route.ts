import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import {
  issueInvitation,
  revokeInvitation,
  EnrollmentError,
} from "@/lib/storefront/enrollment";

/**
 * Owner-scoped invitation CRUD.
 *   GET    -> list this tenant's invitations
 *   POST   -> issue a new invitation, optionally with pre-quoted prices
 *   DELETE -> revoke an invitation by id
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });
  const { data } = await supabaseAdmin
    .from("storefront_invitations")
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ invitations: data ?? [] });
}

interface IssueBody {
  email?: string;
  display_name?: string;
  target_role?: "location_manager" | "requestor" | "operator";
  quoted_prices?: Array<{ product_id: string; customer_price: number }>;
  campaign?: string;
  source?: string;
  expires_in_days?: number;
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as IssueBody;
  try {
    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000)
      : null;
    const invitation = await issueInvitation({
      tenantId: tenant.id,
      invitedBy: userId,
      email: body.email ?? null,
      displayName: body.display_name ?? null,
      targetRole: body.target_role,
      quotedPrices: body.quoted_prices,
      campaign: body.campaign ?? null,
      source: body.source ?? "operator_dashboard",
      expiresAt,
    });
    // Best-effort: email the invitation link if we captured an address.
    if (invitation.email) {
      const { sendInvitationEmail } = await import("@/lib/storefront/emails");
      const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      void sendInvitationEmail({
        tenant,
        to: invitation.email,
        displayName: invitation.display_name,
        inviteUrl: `${origin}/coffee/invite/${invitation.token}`,
      });
    }
    return NextResponse.json({ invitation });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[storefront/tenant/invitations] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });
  const invitationId = req.nextUrl.searchParams.get("id");
  const reason = req.nextUrl.searchParams.get("reason");
  if (!invitationId) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Confirm invitation belongs to this tenant before we let the owner revoke it.
  const { data: rowRaw } = await supabaseAdmin
    .from("storefront_invitations")
    .select("id, tenant_id")
    .eq("id", invitationId)
    .maybeSingle();
  const row = rowRaw as { id: string; tenant_id: string } | null;
  if (!row || row.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await revokeInvitation({ invitationId, actorId: userId, reason });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EnrollmentError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    console.error("[storefront/tenant/invitations DELETE] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
