/**
 * Storefront tenant CRUD + lookup.
 *
 * Central place for the tenant lifecycle: create a new tenant row
 * against an operator profile, look one up by slug for the public
 * page, look up owned tenants for a signed-in operator, approve /
 * suspend / close a tenant, and update branding / contact / tier.
 *
 * The DB enforces the identity constraints (unique slug, unique
 * subdomain, single tenant per owner_profile_id, status enum) — this
 * layer sanitizes input, calls the DB, and records an audit event.
 *
 * All writes go through supabaseAdmin because RLS on
 * storefront_tenants is admin-write / owner-read; the API route
 * that calls into here is responsible for having authorized the
 * actor first.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { recordAuditEvent, diff } from "@/lib/storefront/audit";

// ─── Types ────────────────────────────────────────────────────────

export type TenantStatus = "pending" | "approved" | "suspended" | "closed";
export type TaxStatus = "not_started" | "submitted" | "approved" | "rejected";
export type PayoutMethod = "qb_bill" | "ach" | "check";

export interface TenantBrand {
  logo_url?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  accent_color?: string | null;
  text_color?: string | null;
  hero_headline?: string | null;
  hero_subheadline?: string | null;
  footer_note?: string | null;
}

export interface TenantPublicPage {
  enrollment_cta_label?: string | null;
  show_contact?: boolean;
  catalog_intro?: string | null;
  allow_guest_browse?: boolean;
}

export interface StorefrontTenant {
  id: string;
  owner_profile_id: string;
  slug: string;
  subdomain: string | null;
  legal_name: string;
  display_name: string;
  status: TenantStatus;
  approved_at: string | null;
  approved_by: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  support_email: string | null;
  brand: TenantBrand;
  public_page: TenantPublicPage;
  base_pricing_tier_id: string | null;
  qb_vendor_ref: string | null;
  qb_customer_ref: string | null;
  tax_status: TaxStatus;
  w9_submitted_at: string | null;
  w9_approved_at: string | null;
  payout_method: PayoutMethod | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export class StorefrontTenantError extends Error {
  public code:
    | "INVALID_SLUG"
    | "INVALID_SUBDOMAIN"
    | "SLUG_TAKEN"
    | "SUBDOMAIN_TAKEN"
    | "OWNER_HAS_TENANT"
    | "TENANT_NOT_FOUND"
    | "INVALID_STATE_TRANSITION"
    | "MISSING_FIELD";
  constructor(code: StorefrontTenantError["code"], message: string) {
    super(message);
    this.name = "StorefrontTenantError";
    this.code = code;
  }
}

// ─── Slug helpers ─────────────────────────────────────────────────

/**
 * Client-visible slug rule (matches the DB CHECK regex):
 *   ^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$
 *
 * Lowercase, digits and hyphens, must start/end with alphanumeric,
 * length 3-62. Bidirectional so slugify() below always produces
 * something we then re-validate against this same rule.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

export function slugify(source: string): string {
  return source
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 62)
    .replace(/^-+|-+$/g, "");
}

/** Suggest a slug from any label, guaranteed to satisfy isValidSlug or throw. */
export function suggestSlug(label: string): string {
  const s = slugify(label);
  if (!isValidSlug(s)) {
    throw new StorefrontTenantError(
      "INVALID_SLUG",
      `Could not derive a valid slug from "${label}"`,
    );
  }
  return s;
}

// ─── Reads ────────────────────────────────────────────────────────

export async function resolveTenantBySlug(slug: string): Promise<StorefrontTenant | null> {
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as StorefrontTenant | null) ?? null;
}

export async function resolveTenantById(id: string): Promise<StorefrontTenant | null> {
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as StorefrontTenant | null) ?? null;
}

/** The single tenant a signed-in operator owns, if any. */
export async function resolveTenantByOwner(ownerProfileId: string): Promise<StorefrontTenant | null> {
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .select("*")
    .eq("owner_profile_id", ownerProfileId)
    .maybeSingle();
  if (error) throw error;
  return (data as StorefrontTenant | null) ?? null;
}

// ─── Writes ───────────────────────────────────────────────────────

export interface CreateTenantInput {
  ownerProfileId: string;
  slug: string;
  legalName: string;
  displayName: string;
  subdomain?: string | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  supportEmail?: string | null;
  brand?: TenantBrand;
  publicPage?: TenantPublicPage;
  basePricingTierId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  /**
   * Initial lifecycle status. Defaults to `pending` (admin approves
   * later). Callers pass `approved` when the owner is pre-qualified:
   * an operator who has already signed the coffee agreement, or an
   * admin creating the tenant directly from the admin console. When
   * approved-at-birth, approved_at/approved_by are stamped in the
   * same insert so the public page and invitation issuing work
   * immediately.
   */
  initialStatus?: Extract<TenantStatus, "pending" | "approved">;
}

/**
 * Create a tenant row. The DB unique constraints on slug, subdomain,
 * and owner_profile_id are the source of truth; we translate their
 * violations into typed errors so the API layer can 409-with-code.
 * Tenants start in `pending` unless the caller pre-qualifies the
 * owner (signed coffee agreement, or admin-created) via initialStatus.
 */
export async function createTenant(input: CreateTenantInput): Promise<StorefrontTenant> {
  if (!input.slug || !isValidSlug(input.slug)) {
    throw new StorefrontTenantError(
      "INVALID_SLUG",
      `Slug "${input.slug}" is invalid; must match ${SLUG_RE.source}`,
    );
  }
  if (input.subdomain && !isValidSlug(input.subdomain)) {
    throw new StorefrontTenantError(
      "INVALID_SUBDOMAIN",
      `Subdomain "${input.subdomain}" is invalid`,
    );
  }
  if (!input.legalName?.trim()) {
    throw new StorefrontTenantError("MISSING_FIELD", "legalName is required");
  }
  if (!input.displayName?.trim()) {
    throw new StorefrontTenantError("MISSING_FIELD", "displayName is required");
  }

  const initialStatus: TenantStatus = input.initialStatus ?? "pending";
  const insert = {
    owner_profile_id: input.ownerProfileId,
    slug: input.slug,
    subdomain: input.subdomain ?? null,
    legal_name: input.legalName.trim(),
    display_name: input.displayName.trim(),
    status: initialStatus,
    approved_at: initialStatus === "approved" ? new Date().toISOString() : null,
    approved_by: initialStatus === "approved" ? (input.actorId ?? null) : null,
    primary_contact_name: input.primaryContactName ?? null,
    primary_contact_email: input.primaryContactEmail ?? null,
    primary_contact_phone: input.primaryContactPhone ?? null,
    support_email: input.supportEmail ?? null,
    brand: input.brand ?? {},
    public_page: input.publicPage ?? {},
    base_pricing_tier_id: input.basePricingTierId ?? null,
  };

  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    // 23505 = unique_violation. Postgres tells us WHICH constraint
    // fired via error.details; we branch on the constraint name.
    if (error.code === "23505") {
      const details = String(error.details ?? error.message ?? "");
      if (details.includes("slug")) {
        throw new StorefrontTenantError(
          "SLUG_TAKEN",
          `Slug "${input.slug}" is already in use`,
        );
      }
      if (details.includes("subdomain")) {
        throw new StorefrontTenantError(
          "SUBDOMAIN_TAKEN",
          `Subdomain "${input.subdomain}" is already in use`,
        );
      }
      if (details.includes("owner_profile_id")) {
        throw new StorefrontTenantError(
          "OWNER_HAS_TENANT",
          `Profile ${input.ownerProfileId} already owns a storefront tenant`,
        );
      }
    }
    throw error;
  }

  const created = data as StorefrontTenant;
  await recordAuditEvent({
    tenantId: created.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: "tenant.created",
    entityType: "storefront_tenant",
    entityId: created.id,
    after: {
      slug: created.slug,
      legal_name: created.legal_name,
      display_name: created.display_name,
      owner_profile_id: created.owner_profile_id,
      status: created.status,
    },
  });
  return created;
}

export interface UpdateTenantInput {
  tenantId: string;
  patch: Partial<{
    display_name: string;
    legal_name: string;
    subdomain: string | null;
    primary_contact_name: string | null;
    primary_contact_email: string | null;
    primary_contact_phone: string | null;
    support_email: string | null;
    brand: TenantBrand;
    public_page: TenantPublicPage;
    base_pricing_tier_id: string | null;
    qb_vendor_ref: string | null;
    qb_customer_ref: string | null;
    tax_status: TaxStatus;
    w9_submitted_at: string | null;
    w9_approved_at: string | null;
    payout_method: PayoutMethod | null;
    metadata: Record<string, unknown>;
  }>;
  actorId?: string | null;
  actorRole?: string | null;
  auditAction?: Extract<
    Parameters<typeof recordAuditEvent>[0]["action"],
    "tenant.branding_updated" | "tenant.tier_assigned" | "tenant.contact_updated" | "tenant.tax_updated"
  >;
  reason?: string | null;
}

export async function updateTenant(input: UpdateTenantInput): Promise<StorefrontTenant> {
  const before = await resolveTenantById(input.tenantId);
  if (!before) {
    throw new StorefrontTenantError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} not found`);
  }
  if (input.patch.subdomain && !isValidSlug(input.patch.subdomain)) {
    throw new StorefrontTenantError(
      "INVALID_SUBDOMAIN",
      `Subdomain "${input.patch.subdomain}" is invalid`,
    );
  }
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .update(input.patch)
    .eq("id", input.tenantId)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const details = String(error.details ?? error.message ?? "");
      if (details.includes("subdomain")) {
        throw new StorefrontTenantError(
          "SUBDOMAIN_TAKEN",
          `Subdomain "${input.patch.subdomain}" is already in use`,
        );
      }
    }
    throw error;
  }
  const after = data as StorefrontTenant;
  const auditAction = input.auditAction ?? "tenant.branding_updated";
  const { before: b, after: a } = diff(
    before as unknown as Record<string, unknown>,
    after as unknown as Record<string, unknown>,
  );
  await recordAuditEvent({
    tenantId: after.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: auditAction,
    entityType: "storefront_tenant",
    entityId: after.id,
    before: b,
    after: a,
    reason: input.reason ?? null,
  });
  return after;
}

export interface TransitionTenantInput {
  tenantId: string;
  actorId?: string | null;
  actorRole?: string | null;
  reason?: string | null;
}

/**
 * pending -> approved. Idempotent when already approved (returns
 * current row without a duplicate audit event).
 */
export async function approveTenant(input: TransitionTenantInput): Promise<StorefrontTenant> {
  const before = await resolveTenantById(input.tenantId);
  if (!before) {
    throw new StorefrontTenantError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} not found`);
  }
  if (before.status === "approved") return before;
  if (before.status !== "pending") {
    throw new StorefrontTenantError(
      "INVALID_STATE_TRANSITION",
      `Cannot approve tenant in ${before.status} state`,
    );
  }
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: input.actorId ?? null,
      suspended_at: null,
      suspended_reason: null,
    })
    .eq("id", input.tenantId)
    .select("*")
    .single();
  if (error) throw error;
  const after = data as StorefrontTenant;
  await recordAuditEvent({
    tenantId: after.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: "tenant.approved",
    entityType: "storefront_tenant",
    entityId: after.id,
    before: { status: before.status },
    after: { status: after.status, approved_at: after.approved_at },
    reason: input.reason ?? null,
  });
  return after;
}

export async function suspendTenant(input: TransitionTenantInput): Promise<StorefrontTenant> {
  const before = await resolveTenantById(input.tenantId);
  if (!before) {
    throw new StorefrontTenantError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} not found`);
  }
  if (before.status === "closed") {
    throw new StorefrontTenantError(
      "INVALID_STATE_TRANSITION",
      `Cannot suspend a closed tenant`,
    );
  }
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .update({
      status: "suspended",
      suspended_at: new Date().toISOString(),
      suspended_reason: input.reason ?? null,
    })
    .eq("id", input.tenantId)
    .select("*")
    .single();
  if (error) throw error;
  const after = data as StorefrontTenant;
  await recordAuditEvent({
    tenantId: after.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: "tenant.suspended",
    entityType: "storefront_tenant",
    entityId: after.id,
    before: { status: before.status },
    after: { status: after.status, suspended_at: after.suspended_at },
    reason: input.reason ?? null,
  });
  return after;
}

export async function closeTenant(input: TransitionTenantInput): Promise<StorefrontTenant> {
  const before = await resolveTenantById(input.tenantId);
  if (!before) {
    throw new StorefrontTenantError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} not found`);
  }
  if (before.status === "closed") return before;
  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .update({ status: "closed" })
    .eq("id", input.tenantId)
    .select("*")
    .single();
  if (error) throw error;
  const after = data as StorefrontTenant;
  await recordAuditEvent({
    tenantId: after.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: "tenant.closed",
    entityType: "storefront_tenant",
    entityId: after.id,
    before: { status: before.status },
    after: { status: after.status },
    reason: input.reason ?? null,
  });
  return after;
}

/**
 * Reassign a tenant's owner (admin-only path). One tenant per
 * owner is a DB unique constraint — reassigning to a profile that
 * already owns a storefront surfaces OWNER_HAS_TENANT. Audited as
 * tenant.owner_reassigned with the before/after owner ids so the
 * history reads clearly.
 */
export async function assignOwner(input: {
  tenantId: string;
  ownerProfileId: string;
  actorId?: string | null;
  actorRole?: string | null;
  reason?: string | null;
}): Promise<StorefrontTenant> {
  const before = await resolveTenantById(input.tenantId);
  if (!before) {
    throw new StorefrontTenantError("TENANT_NOT_FOUND", `Tenant ${input.tenantId} not found`);
  }
  if (before.owner_profile_id === input.ownerProfileId) return before;

  const { data, error } = await supabaseAdmin
    .from("storefront_tenants")
    .update({ owner_profile_id: input.ownerProfileId })
    .eq("id", input.tenantId)
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new StorefrontTenantError(
        "OWNER_HAS_TENANT",
        `Profile ${input.ownerProfileId} already owns a storefront tenant`,
      );
    }
    throw error;
  }
  const after = data as StorefrontTenant;
  await recordAuditEvent({
    tenantId: after.id,
    actorId: input.actorId ?? null,
    actorRole: input.actorRole ?? null,
    action: "tenant.owner_reassigned",
    entityType: "storefront_tenant",
    entityId: after.id,
    before: { owner_profile_id: before.owner_profile_id },
    after: { owner_profile_id: after.owner_profile_id },
    reason: input.reason ?? null,
  });
  return after;
}

/**
 * Assign / reassign the base pricing tier used by the pricing
 * resolver. Split from generic updateTenant so the audit action is
 * specific ("tenant.tier_assigned") and consumers reading history
 * can filter clearly.
 */
export async function assignPricingTier(input: {
  tenantId: string;
  basePricingTierId: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  reason?: string | null;
}): Promise<StorefrontTenant> {
  return updateTenant({
    tenantId: input.tenantId,
    patch: { base_pricing_tier_id: input.basePricingTierId },
    actorId: input.actorId,
    actorRole: input.actorRole,
    reason: input.reason,
    auditAction: "tenant.tier_assigned",
  });
}
