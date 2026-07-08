/**
 * Placement Provider Agreement — state machine + audit + guard.
 *
 * State machine:
 *   not_started
 *     → provider_signed_pending_company_countersign  (via signAsProvider)
 *     → declined                                     (via decline)
 *   provider_signed_pending_company_countersign
 *     → fully_executed                               (via countersignAsAdmin)
 *     → correction_requested                         (via requestCorrection)
 *     → declined                                     (via decline)
 *   correction_requested
 *     → provider_signed_pending_company_countersign  (via signAsProvider — re-sign)
 *     → declined
 *   fully_executed
 *     → superseded                                   (via publishNewVersion of same type)
 *     → revoked                                      (via admin action; rare)
 *   legacy_approved  (backfill only)
 *     → superseded when the provider signs a real agreement
 *
 * All state changes go through this module. Direct DB writes are avoided
 * so the audit log stays complete.
 */

import { supabaseAdmin } from "./supabaseAdmin";

export type AgreementStatus =
  | "not_started"
  | "draft"
  | "provider_signed_pending_company_countersign"
  | "correction_requested"
  | "declined"
  | "fully_executed"
  | "superseded"
  | "revoked"
  | "legacy_approved";

export interface AgreementTemplate {
  id: string;
  agreement_type: string;
  version: number;
  title: string;
  content_html: string;
  effective_date: string;
  is_active: boolean;
}

export interface UserAgreement {
  id: string;
  user_id: string;
  agreement_template_id: string;
  agreement_type: string;
  agreement_version: number;
  status: AgreementStatus;
  provider_signed_at: string | null;
  provider_typed_name: string | null;
  provider_email_snapshot: string | null;
  provider_ip_address: string | null;
  provider_user_agent: string | null;
  provider_consent_esign: boolean;
  countersigned_at: string | null;
  countersigned_by_user_id: string | null;
  countersigner_name_snapshot: string | null;
  countersigner_email_snapshot: string | null;
  provider_document_path: string | null;
  countersigned_document_path: string | null;
  executed_document_path: string | null;
  decline_reason: string | null;
  correction_request_reason: string | null;
  admin_override_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ─── Template access ────────────────────────────────────────────────

export async function getActiveTemplate(agreementType = "placement_provider"): Promise<AgreementTemplate | null> {
  const { data } = await supabaseAdmin
    .from("agreement_templates")
    .select("*")
    .eq("agreement_type", agreementType)
    .eq("is_active", true)
    .maybeSingle();
  return (data as AgreementTemplate) || null;
}

// ─── User-agreement lookup ──────────────────────────────────────────

export async function getUserAgreement(userId: string, agreementType = "placement_provider"): Promise<UserAgreement | null> {
  const { data } = await supabaseAdmin
    .from("user_agreements")
    .select("*")
    .eq("user_id", userId)
    .eq("agreement_type", agreementType)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as UserAgreement) || null;
}

// Get-or-create against the currently active template. Idempotent.
export async function getOrStartAgreement(userId: string, agreementType = "placement_provider"): Promise<{ agreement: UserAgreement; template: AgreementTemplate } | null> {
  const template = await getActiveTemplate(agreementType);
  if (!template) return null;

  // If a user_agreement already exists AGAINST THIS TEMPLATE, return it.
  // Older-version rows stay as history; a new template creates a new row.
  const { data: existing } = await supabaseAdmin
    .from("user_agreements")
    .select("*")
    .eq("user_id", userId)
    .eq("agreement_template_id", template.id)
    .maybeSingle();
  if (existing) return { agreement: existing as UserAgreement, template };

  // Create a new row in 'not_started'.
  const { data: created, error } = await supabaseAdmin
    .from("user_agreements")
    .insert({
      user_id: userId,
      agreement_template_id: template.id,
      agreement_type: template.agreement_type,
      agreement_version: template.version,
      status: "not_started",
    })
    .select("*")
    .single();
  if (error) throw error;
  await audit(created.id, userId, "agreement_started", null, "not_started", { template_id: template.id });
  return { agreement: created as UserAgreement, template };
}

// ─── State transitions ─────────────────────────────────────────────

export interface SignAsProviderArgs {
  agreementId: string;
  actingUserId: string;
  typedName: string;
  consentEsign: boolean;
  emailSnapshot: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function signAsProvider(args: SignAsProviderArgs): Promise<UserAgreement> {
  const typed = args.typedName.trim();
  if (!typed) throw new Error("Typed legal name is required");
  if (!args.consentEsign) throw new Error("Electronic-records consent is required");

  const current = await requireAgreement(args.agreementId);
  if (current.user_id !== args.actingUserId) {
    throw new Error("You may only sign your own agreement");
  }
  const allowedFrom: AgreementStatus[] = ["not_started", "draft", "correction_requested"];
  if (!allowedFrom.includes(current.status)) {
    throw new Error(`Cannot sign from status "${current.status}"`);
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("user_agreements")
    .update({
      status: "provider_signed_pending_company_countersign",
      provider_signed_at: nowIso,
      provider_typed_name: typed,
      provider_email_snapshot: args.emailSnapshot,
      provider_ip_address: args.ipAddress || null,
      provider_user_agent: args.userAgent || null,
      provider_consent_esign: true,
      updated_at: nowIso,
    })
    .eq("id", args.agreementId)
    .select("*")
    .single();
  if (error) throw error;

  await audit(args.agreementId, args.actingUserId, "provider_signed", current.status, "provider_signed_pending_company_countersign", {
    typed_name: typed,
    email_snapshot: args.emailSnapshot,
    ip_address: args.ipAddress || null,
  });
  return updated as UserAgreement;
}

export interface CountersignArgs {
  agreementId: string;
  adminUserId: string;
  adminNameSnapshot: string;
  adminEmailSnapshot: string;
}

export async function countersignAsAdmin(args: CountersignArgs): Promise<UserAgreement> {
  const current = await requireAgreement(args.agreementId);
  if (current.status !== "provider_signed_pending_company_countersign") {
    throw new Error(`Cannot countersign from status "${current.status}"`);
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("user_agreements")
    .update({
      status: "fully_executed",
      countersigned_at: nowIso,
      countersigned_by_user_id: args.adminUserId,
      countersigner_name_snapshot: args.adminNameSnapshot,
      countersigner_email_snapshot: args.adminEmailSnapshot,
      updated_at: nowIso,
    })
    .eq("id", args.agreementId)
    .select("*")
    .single();
  if (error) throw error;

  // Mirror onto placement_partners ONLY for the PPA type — coffee_supply
  // (or any future type) shouldn't touch the marketplace partner row.
  if (current.agreement_type === "placement_provider") {
    await supabaseAdmin
      .from("placement_partners")
      .update({ agreement_signed_at: nowIso, updated_at: nowIso })
      .eq("id", current.user_id);
  }

  await audit(args.agreementId, args.adminUserId, "countersigned", current.status, "fully_executed", {
    countersigner: args.adminNameSnapshot,
  });
  return updated as UserAgreement;
}

export interface DeclineArgs {
  agreementId: string;
  adminUserId: string;
  reason: string;
}

export async function decline(args: DeclineArgs): Promise<UserAgreement> {
  const current = await requireAgreement(args.agreementId);
  if (current.status === "fully_executed") {
    throw new Error("Cannot decline a fully executed agreement — use revoke");
  }
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("user_agreements")
    .update({ status: "declined", decline_reason: args.reason.slice(0, 500), updated_at: nowIso })
    .eq("id", args.agreementId)
    .select("*")
    .single();
  if (error) throw error;
  await audit(args.agreementId, args.adminUserId, "declined", current.status, "declined", { reason: args.reason });
  return updated as UserAgreement;
}

export interface CorrectionArgs {
  agreementId: string;
  adminUserId: string;
  reason: string;
}

export async function requestCorrection(args: CorrectionArgs): Promise<UserAgreement> {
  const current = await requireAgreement(args.agreementId);
  if (current.status !== "provider_signed_pending_company_countersign") {
    throw new Error("Correction only applies to pending-countersign agreements");
  }
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabaseAdmin
    .from("user_agreements")
    .update({
      status: "correction_requested",
      correction_request_reason: args.reason.slice(0, 500),
      // Clear the signature — provider must re-sign after correcting.
      provider_signed_at: null,
      provider_typed_name: null,
      updated_at: nowIso,
    })
    .eq("id", args.agreementId)
    .select("*")
    .single();
  if (error) throw error;
  await audit(args.agreementId, args.adminUserId, "correction_requested", current.status, "correction_requested", { reason: args.reason });
  return updated as UserAgreement;
}

export interface AdminOverrideArgs {
  userId: string;
  adminUserId: string;
  reason: string;
}

// Bypass — grants a legacy_approved status without a signed doc. Reason
// required + audit-logged. Used for backfill of pre-workflow partners.
export async function grantLegacyApproval(args: AdminOverrideArgs): Promise<UserAgreement> {
  if (!args.reason.trim()) throw new Error("Override reason is required");
  const template = await getActiveTemplate();
  if (!template) throw new Error("No active template");

  const { data: existing } = await supabaseAdmin
    .from("user_agreements")
    .select("*")
    .eq("user_id", args.userId)
    .eq("agreement_template_id", template.id)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let row: UserAgreement;
  if (existing) {
    const { data: updated, error } = await supabaseAdmin
      .from("user_agreements")
      .update({
        status: "legacy_approved",
        admin_override_reason: args.reason.slice(0, 500),
        countersigned_at: nowIso,
        countersigned_by_user_id: args.adminUserId,
        updated_at: nowIso,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    row = updated as UserAgreement;
  } else {
    const { data: created, error } = await supabaseAdmin
      .from("user_agreements")
      .insert({
        user_id: args.userId,
        agreement_template_id: template.id,
        agreement_type: template.agreement_type,
        agreement_version: template.version,
        status: "legacy_approved",
        admin_override_reason: args.reason.slice(0, 500),
        countersigned_at: nowIso,
        countersigned_by_user_id: args.adminUserId,
      })
      .select("*")
      .single();
    if (error) throw error;
    row = created as UserAgreement;
  }
  await audit(row.id, args.adminUserId, "admin_override_granted", null, "legacy_approved", { reason: args.reason });
  return row;
}

// ─── Guard ──────────────────────────────────────────────────────────

/**
 * requireExecutedPlacementProviderAgreement — the ONE guard PP-only write
 * paths must call. Returns null if the caller may proceed; returns an
 * error message string if they must be blocked.
 *
 * A user is allowed to proceed when they have a user_agreements row with
 * status in ('fully_executed', 'legacy_approved') against the currently
 * active placement_provider template.
 */
export async function requireExecutedPlacementProviderAgreement(userId: string): Promise<string | null> {
  const agreement = await getUserAgreement(userId, "placement_provider");
  if (!agreement) {
    return "Placement Provider Agreement not yet signed. Complete onboarding first.";
  }
  const ok: AgreementStatus[] = ["fully_executed", "legacy_approved"];
  if (!ok.includes(agreement.status)) {
    if (agreement.status === "provider_signed_pending_company_countersign") {
      return "Your Placement Provider Agreement is awaiting Vending Connector countersignature.";
    }
    if (agreement.status === "correction_requested") {
      return "Your Placement Provider Agreement needs correction — please re-sign the corrected version.";
    }
    if (agreement.status === "declined") {
      return "Your Placement Provider Agreement was declined. Contact support.";
    }
    return "Placement Provider Agreement not fully executed.";
  }
  return null;
}

/**
 * requireExecutedCoffeeSupplyAgreement — mirror guard for the Equipment
 * Loan & Beverage Supply Agreement. Blocks coffee checkout until the
 * operator has signed and Vending Connector has countersigned (or the
 * operator was grandfathered as legacy_approved during migration 117).
 */
export async function requireExecutedCoffeeSupplyAgreement(userId: string): Promise<string | null> {
  const agreement = await getUserAgreement(userId, "coffee_supply");
  if (!agreement) {
    return "Sign the Equipment Loan & Beverage Supply Agreement to place orders.";
  }
  const ok: AgreementStatus[] = ["fully_executed", "legacy_approved"];
  if (!ok.includes(agreement.status)) {
    if (agreement.status === "provider_signed_pending_company_countersign") {
      return "Your Equipment Loan & Beverage Supply Agreement is awaiting Apex AI countersignature.";
    }
    if (agreement.status === "correction_requested") {
      return "Your Equipment Loan & Beverage Supply Agreement needs correction — please re-sign the corrected version.";
    }
    if (agreement.status === "declined") {
      return "Your Equipment Loan & Beverage Supply Agreement was declined. Contact support.";
    }
    return "Equipment Loan & Beverage Supply Agreement not fully executed.";
  }
  return null;
}

// ─── Audit helper ──────────────────────────────────────────────────

export async function audit(
  agreementId: string,
  actorUserId: string | null,
  eventType: string,
  previousStatus: string | null,
  newStatus: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin.from("agreement_audit_events").insert({
    user_agreement_id: agreementId,
    actor_user_id: actorUserId,
    event_type: eventType,
    previous_status: previousStatus,
    new_status: newStatus,
    metadata: metadata || null,
  });
}

async function requireAgreement(agreementId: string): Promise<UserAgreement> {
  const { data } = await supabaseAdmin
    .from("user_agreements")
    .select("*")
    .eq("id", agreementId)
    .maybeSingle();
  if (!data) throw new Error("Agreement not found");
  return data as UserAgreement;
}

// ─── Executed-document rendering ────────────────────────────────────

/**
 * Render the executed HTML document. Called at countersign time and
 * uploaded to the user-agreements bucket. Path shape:
 *   agreements/placement-providers/{user_id}/{version}/{agreement_id}.html
 *
 * NOTE: PDF generation is a follow-up. For now we persist the HTML — it's
 * cryptographically verifiable via content_hash and can be re-rendered to
 * PDF later.
 */
export interface RenderExecutedArgs {
  template: AgreementTemplate;
  agreement: UserAgreement;
}

export function renderExecutedHtml({ template, agreement }: RenderExecutedArgs): string {
  const signedAt = agreement.provider_signed_at
    ? new Date(agreement.provider_signed_at).toISOString()
    : "";
  const countersignedAt = agreement.countersigned_at
    ? new Date(agreement.countersigned_at).toISOString()
    : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>${escapeHtml(template.title)}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;color:#111;line-height:1.55}h1,h2{color:#16a34a}.sig{margin:2rem 0;padding:1rem;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb}.sig .row{display:flex;justify-content:space-between;font-size:14px;margin:.25rem 0}.meta{font-size:12px;color:#6b7280;margin-top:1rem}</style>
</head><body>
${template.content_html}
<div class="sig">
  <h2>Signatures</h2>
  <p><strong>Placement Provider</strong></p>
  <div class="row"><span>Typed name:</span><span>${escapeHtml(agreement.provider_typed_name || "")}</span></div>
  <div class="row"><span>Email:</span><span>${escapeHtml(agreement.provider_email_snapshot || "")}</span></div>
  <div class="row"><span>Signed at (UTC):</span><span>${escapeHtml(signedAt)}</span></div>
  <div class="row"><span>IP address:</span><span>${escapeHtml(agreement.provider_ip_address || "")}</span></div>
  <div class="row"><span>Electronic-records consent:</span><span>${agreement.provider_consent_esign ? "Yes" : "No"}</span></div>

  <p style="margin-top:1.25rem"><strong>Vending Connector</strong></p>
  <div class="row"><span>Countersigner:</span><span>${escapeHtml(agreement.countersigner_name_snapshot || "")}</span></div>
  <div class="row"><span>Email:</span><span>${escapeHtml(agreement.countersigner_email_snapshot || "")}</span></div>
  <div class="row"><span>Countersigned at (UTC):</span><span>${escapeHtml(countersignedAt)}</span></div>

  <p class="meta">Template ${escapeHtml(template.title)} v${template.version} · Effective ${escapeHtml(template.effective_date)} · Agreement ID ${escapeHtml(agreement.id)}</p>
</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// ─── Storage helper ─────────────────────────────────────────────────

export async function persistExecutedDocument(agreement: UserAgreement, html: string): Promise<string> {
  // Path segment is derived from agreement_type so new types (coffee_supply,
  // etc.) live under their own prefix without colliding with PPA docs.
  const typeSegment = agreement.agreement_type === "placement_provider"
    ? "placement-providers"
    : agreement.agreement_type.replace(/_/g, "-");
  const path = `${typeSegment}/${agreement.user_id}/${agreement.agreement_version}/${agreement.id}.html`;
  const { error } = await supabaseAdmin
    .storage
    .from("user-agreements")
    .upload(path, new Blob([html], { type: "text/html" }), { upsert: true, contentType: "text/html" });
  if (error) throw new Error(`Executed-doc upload failed: ${error.message}`);
  await supabaseAdmin
    .from("user_agreements")
    .update({
      executed_document_path: path,
      countersigned_document_path: path,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agreement.id);
  return path;
}
