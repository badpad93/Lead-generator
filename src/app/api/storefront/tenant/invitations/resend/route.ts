import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import { recordAuditEvent } from "@/lib/storefront/audit";

/**
 * POST /api/storefront/tenant/invitations/resend  { id }
 *
 * Re-email an ACTIVE invitation's link to the address on the
 * invitation. The token is the credential and lives in plaintext
 * on the row (the URL IS the credential — see enrollment.ts), so
 * resending is literally the same link again; no new invitation
 * row, no invalidation of the copy the customer may already have.
 *
 * Refused (409 with a reason code) when the invitation is
 * accepted, revoked, or expired — the operator should issue a
 * fresh invite in those cases — and 400 when the invitation was
 * created link-only with no email captured.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: rowRaw } = await supabaseAdmin
    .from("storefront_invitations")
    .select("id, tenant_id, email, display_name, token, expires_at, revoked_at, accepted_at")
    .eq("id", body.id)
    .maybeSingle();
  const inv = rowRaw as {
    id: string;
    tenant_id: string;
    email: string | null;
    display_name: string | null;
    token: string;
    expires_at: string;
    revoked_at: string | null;
    accepted_at: string | null;
  } | null;

  if (!inv || inv.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (inv.accepted_at) {
    return NextResponse.json(
      { error: "Invitation was already accepted", code: "ALREADY_ACCEPTED" },
      { status: 409 },
    );
  }
  if (inv.revoked_at) {
    return NextResponse.json(
      { error: "Invitation was revoked — issue a new one instead", code: "REVOKED" },
      { status: 409 },
    );
  }
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return NextResponse.json(
      { error: "Invitation has expired — issue a new one instead", code: "EXPIRED" },
      { status: 409 },
    );
  }
  if (!inv.email) {
    return NextResponse.json(
      { error: "This invitation has no email on file — use Copy link instead", code: "NO_EMAIL" },
      { status: 400 },
    );
  }

  const { sendInvitationEmail } = await import("@/lib/storefront/emails");
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  await sendInvitationEmail({
    tenant,
    to: inv.email,
    displayName: inv.display_name,
    inviteUrl: `${origin}/coffee/invite/${inv.token}`,
  });

  await recordAuditEvent({
    tenantId: tenant.id,
    actorId: userId,
    actorRole: "operator",
    action: "customer.invitation_resent",
    entityType: "storefront_invitation",
    entityId: inv.id,
    after: { email: inv.email },
  });

  return NextResponse.json({ ok: true, sent_to: inv.email });
}
