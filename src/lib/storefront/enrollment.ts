/**
 * Storefront customer enrollment via invitation tokens.
 *
 * The rule that makes everything downstream sane:
 *   A customer profile is PERMANENTLY linked to a single tenant.
 *   Once storefront_tenant_id is set, only an Apex admin (via the
 *   audited transfer endpoint) may change it. Enrollment therefore
 *   MUST be one-shot: a profile that already carries a tenant_id
 *   cannot be re-stamped, even by presenting a valid invitation.
 *
 * Layering:
 *   - DB CHECK on `profiles.storefront_tenant_id` uniqueness is a
 *     backstop (only one tenant per profile).
 *   - The `storefront_guard_profile_tenant_change` BEFORE UPDATE
 *     trigger refuses any non-service-role write to the column.
 *   - This module refuses to consume an invitation for an already-
 *     linked profile at the app layer so the API returns a clean
 *     error rather than a DB permission stack.
 *
 * The invitation token itself is opaque (24 random bytes -> 48 hex
 * chars). We store it plain, matching the existing team-invite /
 * guest-track pattern — the URL IS the credential; hashing at rest
 * buys nothing when the same token comes back in the URL.
 */
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordAuditEvent } from "@/lib/storefront/audit";
import { resolveTenantById } from "@/lib/storefront/tenants";

// ─── Types ────────────────────────────────────────────────────────

export type InvitationTargetRole = "location_manager" | "requestor" | "operator";
export type EnrollmentSource =
  | "invitation"
  | "direct_link"
  | "admin_manual"
  | "admin_transfer"
  | "migration";

export interface StorefrontInvitation {
  id: string;
  tenant_id: string;
  invited_by: string;
  token: string;
  email: string | null;
  display_name: string | null;
  target_role: InvitationTargetRole;
  quoted_prices: Array<{ product_id: string; customer_price: number }> | null;
  expires_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
  campaign: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export class EnrollmentError extends Error {
  public code:
    | "TENANT_NOT_FOUND"
    | "TENANT_NOT_APPROVED"
    | "INVITATION_NOT_FOUND"
    | "INVITATION_EXPIRED"
    | "INVITATION_REVOKED"
    | "INVITATION_ALREADY_USED"
    | "PROFILE_NOT_FOUND"
    | "PROFILE_ALREADY_LINKED"
    | "PROFILE_LINKED_TO_OTHER_TENANT"
    | "BAD_TARGET_ROLE";
  constructor(code: EnrollmentError["code"], message: string) {
    super(message);
    this.name = "EnrollmentError";
    this.code = code;
  }
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

// ─── Issue an invitation ──────────────────────────────────────────

export interface IssueInvitationInput {
  tenantId: string;
  invitedBy: string;
  email?: string | null;
  displayName?: string | null;
  targetRole?: InvitationTargetRole;
  /**
   * Optional pre-quoted per-customer prices. On consume, these are
   * copied to storefront_customer_prices with source='invitation'
   * so the customer's very first cart already reflects the deal
   * the tenant wanted them on.
   */
  quotedPrices?: Array<{ product_id: string; customer_price: number }>;
  expiresAt?: Date | null;
  campaign?: string | null;
  source?: string | null;
}

export async function issueInvitation(input: IssueInvitationInput): Promise<StorefrontInvitation> {
  const tenant = await resolveTenantById(input.tenantId);
  if (!tenant) {
    throw new EnrollmentError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} not found`);
  }
  if (tenant.status !== "approved") {
    throw new EnrollmentError(
      "TENANT_NOT_APPROVED",
      `Tenant ${input.tenantId} is ${tenant.status}; only approved tenants may issue invitations`,
    );
  }

  const token = generateToken();
  const targetRole: InvitationTargetRole = input.targetRole ?? "location_manager";
  if (!["location_manager", "requestor", "operator"].includes(targetRole)) {
    throw new EnrollmentError("BAD_TARGET_ROLE", `Unsupported target_role ${targetRole}`);
  }

  const { data, error } = await supabaseAdmin
    .from("storefront_invitations")
    .insert({
      tenant_id: input.tenantId,
      invited_by: input.invitedBy,
      token,
      email: input.email ?? null,
      display_name: input.displayName ?? null,
      target_role: targetRole,
      quoted_prices: input.quotedPrices ?? null,
      expires_at: (input.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).toISOString(),
      campaign: input.campaign ?? null,
      source: input.source ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  const invitation = data as StorefrontInvitation;

  await recordAuditEvent({
    tenantId: input.tenantId,
    actorId: input.invitedBy,
    action: "customer.invited",
    entityType: "storefront_invitation",
    entityId: invitation.id,
    after: {
      email: invitation.email,
      target_role: invitation.target_role,
      expires_at: invitation.expires_at,
    },
  });

  return invitation;
}

// ─── Revoke an invitation ─────────────────────────────────────────

export async function revokeInvitation(input: {
  invitationId: string;
  actorId: string;
  reason?: string | null;
}): Promise<void> {
  const { data: before } = await supabaseAdmin
    .from("storefront_invitations")
    .select("id, tenant_id, revoked_at, accepted_at")
    .eq("id", input.invitationId)
    .maybeSingle();
  if (!before) {
    throw new EnrollmentError("INVITATION_NOT_FOUND", `Invitation ${input.invitationId} not found`);
  }
  if ((before as { accepted_at: string | null }).accepted_at) {
    throw new EnrollmentError(
      "INVITATION_ALREADY_USED",
      `Invitation ${input.invitationId} was already accepted`,
    );
  }
  if ((before as { revoked_at: string | null }).revoked_at) return;

  await supabaseAdmin
    .from("storefront_invitations")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: input.reason ?? null })
    .eq("id", input.invitationId);

  await recordAuditEvent({
    tenantId: (before as { tenant_id: string }).tenant_id,
    actorId: input.actorId,
    action: "customer.invitation_revoked",
    entityType: "storefront_invitation",
    entityId: input.invitationId,
    reason: input.reason ?? null,
  });
}

// ─── Read an invitation by token (safe preview) ───────────────────

/**
 * Public-safe lookup that returns invitation + a redacted tenant
 * summary for the enrollment landing page ("You've been invited to
 * ACME Coffee — Continue"). Never surfaces admin fields.
 */
export interface InvitationPreview {
  invitation: {
    id: string;
    tenant_id: string;
    email: string | null;
    display_name: string | null;
    target_role: InvitationTargetRole;
    expires_at: string;
    already_used: boolean;
    expired: boolean;
    revoked: boolean;
  };
  tenant: {
    id: string;
    slug: string;
    display_name: string;
    brand: Record<string, unknown>;
    public_page: Record<string, unknown>;
  };
}

export async function previewInvitationByToken(token: string): Promise<InvitationPreview | null> {
  const { data: invitationRow } = await supabaseAdmin
    .from("storefront_invitations")
    .select("id, tenant_id, email, display_name, target_role, expires_at, revoked_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (!invitationRow) return null;

  const invitation = invitationRow as {
    id: string;
    tenant_id: string;
    email: string | null;
    display_name: string | null;
    target_role: InvitationTargetRole;
    expires_at: string;
    revoked_at: string | null;
    accepted_at: string | null;
  };

  const tenant = await resolveTenantById(invitation.tenant_id);
  if (!tenant) return null;

  return {
    invitation: {
      id: invitation.id,
      tenant_id: invitation.tenant_id,
      email: invitation.email,
      display_name: invitation.display_name,
      target_role: invitation.target_role,
      expires_at: invitation.expires_at,
      already_used: invitation.accepted_at !== null,
      expired: new Date(invitation.expires_at) < new Date(),
      revoked: invitation.revoked_at !== null,
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      display_name: tenant.display_name,
      brand: tenant.brand as Record<string, unknown>,
      public_page: tenant.public_page as Record<string, unknown>,
    },
  };
}

// ─── Consume an invitation (the one-shot link) ────────────────────

export interface ConsumeInvitationInput {
  token: string;
  profileId: string;
  source?: EnrollmentSource;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ConsumeInvitationResult {
  tenantId: string;
  profileId: string;
  invitationId: string;
  targetRole: InvitationTargetRole;
  copiedCustomerPrices: number;
}

/**
 * One-shot invitation consume:
 *   1. Validate invitation state (exists, not revoked, not used, not expired).
 *   2. Load the profile; refuse if it's already linked to some tenant.
 *      This is the permanent-link guarantee at the application layer.
 *   3. Link profile.storefront_tenant_id + enrollment_source + enrolled_at.
 *   4. Mark invitation accepted_at + accepted_by (SETting these is what
 *      makes the token single-use — subsequent attempts fall through the
 *      `accepted_at IS NOT NULL` guard).
 *   5. Copy any quoted_prices to storefront_customer_prices with
 *      source='invitation' + source_ref_id=invitation.id so pricing
 *      already reflects the pre-quote on the customer's first order.
 *   6. Audit: customer.enrolled.
 *
 * Steps 3 and 4 both write; if the profile link fails, the invitation
 * stays unaccepted and the customer can retry. If (5) fails after (3-4),
 * we log but don't roll back: the enrollment link is the priority; a
 * missing customer price row falls through to the tenant default.
 */
export async function consumeInvitation(
  input: ConsumeInvitationInput,
): Promise<ConsumeInvitationResult> {
  // 1. Invitation
  const { data: invRow } = await supabaseAdmin
    .from("storefront_invitations")
    .select("*")
    .eq("token", input.token)
    .maybeSingle();
  if (!invRow) {
    throw new EnrollmentError("INVITATION_NOT_FOUND", "Invitation not found");
  }
  const invitation = invRow as StorefrontInvitation;
  if (invitation.revoked_at) {
    throw new EnrollmentError("INVITATION_REVOKED", "Invitation has been revoked");
  }
  if (invitation.accepted_at) {
    throw new EnrollmentError("INVITATION_ALREADY_USED", "Invitation was already used");
  }
  if (new Date(invitation.expires_at) < new Date()) {
    throw new EnrollmentError("INVITATION_EXPIRED", "Invitation has expired");
  }

  // 2. Profile — must exist and NOT already be linked.
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("id, role, storefront_tenant_id")
    .eq("id", input.profileId)
    .maybeSingle();
  if (!profileRow) {
    throw new EnrollmentError("PROFILE_NOT_FOUND", `Profile ${input.profileId} not found`);
  }
  const profile = profileRow as {
    id: string;
    role: string;
    storefront_tenant_id: string | null;
  };
  if (profile.storefront_tenant_id) {
    if (profile.storefront_tenant_id === invitation.tenant_id) {
      throw new EnrollmentError(
        "PROFILE_ALREADY_LINKED",
        `Profile is already enrolled with this tenant`,
      );
    }
    throw new EnrollmentError(
      "PROFILE_LINKED_TO_OTHER_TENANT",
      `Profile is already permanently linked to another storefront tenant; only Apex admin can transfer`,
    );
  }

  // 3. Link profile. Also stamp the target role if it wasn't set — an
  //    invitation that says "location_manager" but arrives for a profile
  //    that was created as 'requestor' should upgrade the role
  //    (application-layer decision — no downgrade).
  const desiredRole = invitation.target_role;
  const roleShouldUpdate =
    desiredRole && profile.role !== desiredRole && profile.role === "requestor";
  const patch: Record<string, unknown> = {
    storefront_tenant_id: invitation.tenant_id,
    storefront_enrolled_at: new Date().toISOString(),
    storefront_enrollment_source: input.source ?? "invitation",
  };
  if (roleShouldUpdate) patch.role = desiredRole;
  const { error: linkErr } = await supabaseAdmin
    .from("profiles")
    .update(patch)
    .eq("id", input.profileId);
  if (linkErr) throw linkErr;

  // 4. Mark invitation accepted — this is the atomic single-use flip.
  const { error: acceptErr } = await supabaseAdmin
    .from("storefront_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by: input.profileId,
    })
    .eq("id", invitation.id)
    .is("accepted_at", null);
  if (acceptErr) throw acceptErr;

  // 5. Copy quoted per-customer prices. Best-effort — log and continue.
  let copied = 0;
  if (invitation.quoted_prices && Array.isArray(invitation.quoted_prices)) {
    const rows = invitation.quoted_prices
      .filter(
        (q) =>
          q &&
          typeof q.product_id === "string" &&
          typeof q.customer_price === "number" &&
          q.customer_price >= 0,
      )
      .map((q) => ({
        tenant_id: invitation.tenant_id,
        customer_profile_id: input.profileId,
        product_id: q.product_id,
        customer_price: q.customer_price,
        source: "invitation" as const,
        source_ref_id: invitation.id,
      }));
    if (rows.length > 0) {
      const { error: priceErr } = await supabaseAdmin
        .from("storefront_customer_prices")
        .insert(rows);
      if (priceErr) {
        console.error("[storefront.enrollment] failed to copy quoted prices", priceErr.message);
      } else {
        copied = rows.length;
      }
    }
  }

  await recordAuditEvent({
    tenantId: invitation.tenant_id,
    actorId: input.profileId,
    action: "customer.enrolled",
    entityType: "profile",
    entityId: input.profileId,
    after: {
      invitation_id: invitation.id,
      target_role: invitation.target_role,
      source: input.source ?? "invitation",
      copied_prices: copied,
    },
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });

  return {
    tenantId: invitation.tenant_id,
    profileId: input.profileId,
    invitationId: invitation.id,
    targetRole: invitation.target_role,
    copiedCustomerPrices: copied,
  };
}

// ─── Admin transfer (rare, audited) ───────────────────────────────

/**
 * Admin-only: move a customer from tenant A to tenant B.
 *
 * The profile's storefront_tenant_id is protected by the
 * storefront_guard_profile_tenant_change trigger; this call runs
 * through the service-role Supabase client, so the trigger permits
 * the write. The audit event records both sides.
 */
export async function transferCustomer(input: {
  customerProfileId: string;
  toTenantId: string;
  adminActorId: string;
  reason: string;
}): Promise<void> {
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("id, storefront_tenant_id")
    .eq("id", input.customerProfileId)
    .maybeSingle();
  if (!profileRow) {
    throw new EnrollmentError("PROFILE_NOT_FOUND", `Profile ${input.customerProfileId} not found`);
  }
  const fromTenant = (profileRow as { storefront_tenant_id: string | null })
    .storefront_tenant_id;

  const toTenant = await resolveTenantById(input.toTenantId);
  if (!toTenant) {
    throw new EnrollmentError("TENANT_NOT_FOUND", `Target tenant ${input.toTenantId} not found`);
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      storefront_tenant_id: input.toTenantId,
      storefront_enrollment_source: "admin_transfer",
      storefront_enrolled_at: new Date().toISOString(),
    })
    .eq("id", input.customerProfileId);
  if (error) throw error;

  await recordAuditEvent({
    tenantId: input.toTenantId,
    actorId: input.adminActorId,
    action: "customer.transferred",
    entityType: "profile",
    entityId: input.customerProfileId,
    before: { storefront_tenant_id: fromTenant },
    after: { storefront_tenant_id: input.toTenantId },
    reason: input.reason,
  });
}
