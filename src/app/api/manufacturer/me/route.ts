import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import {
  filterTopLevelKeys,
  filterStepDataKeys,
} from "@/lib/manufacturerOnboarding/stepData";

/**
 * Manufacturer / Wholesaler self-service endpoint.
 *
 *   GET   returns the caller's partner row (or 404)
 *   POST  bootstraps a manufacturer_partners row for the caller
 *         (idempotent — returns existing if one exists)
 *   PATCH autosaves + advances current_step
 *
 * Never returns admin-only fields (admin_notes, status_reason,
 * reviewed_by, suspended_by, terminated_by). The list of fields the
 * partner may see is enumerated in sanitizeForPartner() below.
 */

const REJECTED_STATUSES = new Set(["rejected", "terminated"]);

export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ partner: null });
  return NextResponse.json({ partner: sanitizeForPartner(data) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Idempotent bootstrap — if a row already exists, return it. Refuse
  // to bootstrap after a hard-terminal admin decision.
  const { data: existing } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (existing) {
    if (REJECTED_STATUSES.has(existing.status)) {
      return NextResponse.json(
        { error: "Your manufacturer application is not active. Contact Vending Connector for details." },
        { status: 403 },
      );
    }
    return NextResponse.json({ partner: sanitizeForPartner(existing) });
  }

  const body = await req.json().catch(() => ({}));
  const legalName =
    typeof body.legal_company_name === "string" && body.legal_company_name.trim()
      ? body.legal_company_name.trim()
      : null;
  if (!legalName) {
    return NextResponse.json({ error: "Legal company name is required to start." }, { status: 400 });
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("manufacturer_partners")
    .insert({
      id: userId,
      legal_company_name: legalName,
      entity_type: "manufacturer",
      status: "draft",
      current_step: 1,
    })
    .select("*")
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ partner: sanitizeForPartner(inserted) });
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("id, status, step_data")
    .eq("id", userId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "No partner record yet" }, { status: 404 });

  // Once past draft, disallow client-side edits to fields the admin
  // is reviewing. Client can still autosave into step_data (wizard
  // UI state) but the top-level columns are frozen from
  // submitted onward.
  const isFrozen = row.status !== "draft" && row.status !== "changes_requested";

  const body = await req.json().catch(() => ({}));
  const rawPatch = typeof body === "object" && body ? body : {};

  const topLevel = filterTopLevelKeys(rawPatch as Record<string, unknown>);
  const stepDataPatch =
    rawPatch.step_data && typeof rawPatch.step_data === "object"
      ? filterStepDataKeys(rawPatch.step_data as Record<string, unknown>)
      : null;

  if (isFrozen) {
    // Only step_data + current_step navigation allowed once submitted
    const allowed: Record<string, unknown> = {};
    if ("current_step" in topLevel) allowed.current_step = topLevel.current_step;
    if (stepDataPatch) {
      allowed.step_data = {
        ...((row.step_data as Record<string, unknown>) ?? {}),
        ...stepDataPatch,
      };
    }
    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "This application is locked from further edits." }, { status: 409 });
    }
    Object.assign(allowed, { updated_at: new Date().toISOString() });
    const { data: updated, error } = await supabaseAdmin
      .from("manufacturer_partners")
      .update(allowed)
      .eq("id", userId)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ partner: sanitizeForPartner(updated) });
  }

  // Draft / changes_requested — merge everything through the allowlist
  const patch: Record<string, unknown> = { ...topLevel, updated_at: new Date().toISOString() };
  if (stepDataPatch) {
    patch.step_data = {
      ...((row.step_data as Record<string, unknown>) ?? {}),
      ...stepDataPatch,
    };
  }
  // Enforce numeric-ish types where relevant
  if ("current_step" in patch) {
    const n = Number(patch.current_step);
    if (!Number.isFinite(n) || n < 1 || n > 6) delete patch.current_step;
    else patch.current_step = Math.floor(n);
  }
  if ("year_established" in patch) {
    const y = Number(patch.year_established);
    if (!Number.isFinite(y) || y < 1800 || y > new Date().getFullYear() + 1) {
      patch.year_established = null;
    } else {
      patch.year_established = Math.floor(y);
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("manufacturer_partners")
    .update(patch)
    .eq("id", userId)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partner: sanitizeForPartner(updated) });
}

// Partner-visible field allowlist. Kept in the API layer per the
// 149b decision (RLS self-read policy dropped — the API is now the
// single point of column allowlisting).
function sanitizeForPartner(row: Record<string, unknown>) {
  return {
    id: row.id,
    legal_company_name: row.legal_company_name,
    dba_or_brand: row.dba_or_brand,
    entity_type: row.entity_type,
    website: row.website,
    ein_tax_id: row.ein_tax_id,
    year_established: row.year_established,
    company_description: row.company_description,
    logo_storage_path: row.logo_storage_path,
    primary_contact_name: row.primary_contact_name,
    primary_contact_title: row.primary_contact_title,
    primary_contact_email: row.primary_contact_email,
    primary_contact_phone: row.primary_contact_phone,
    business_address: row.business_address,
    business_city: row.business_city,
    business_state: row.business_state,
    business_zip: row.business_zip,
    business_country: row.business_country,
    shipping_origin_address: row.shipping_origin_address,
    shipping_origin_city: row.shipping_origin_city,
    shipping_origin_state: row.shipping_origin_state,
    shipping_origin_zip: row.shipping_origin_zip,
    additional_warehouses: row.additional_warehouses,
    order_acknowledgment_time_hours: row.order_acknowledgment_time_hours,
    shipment_lead_time_days: row.shipment_lead_time_days,
    freight_process: row.freight_process,
    liftgate_available: row.liftgate_available,
    inside_delivery_available: row.inside_delivery_available,
    installation_available: row.installation_available,
    return_policy: row.return_policy,
    warranty_summary: row.warranty_summary,
    warranty_doc_received: !!row.warranty_doc_storage_path,
    technical_contact_name: row.technical_contact_name,
    technical_contact_email: row.technical_contact_email,
    technical_contact_phone: row.technical_contact_phone,
    escalation_contact_name: row.escalation_contact_name,
    escalation_contact_email: row.escalation_contact_email,
    escalation_contact_phone: row.escalation_contact_phone,
    inventory_update_method: row.inventory_update_method,
    inventory_update_notes: row.inventory_update_notes,
    current_step: row.current_step,
    step_data: row.step_data,
    // Status is visible to the partner (they need to see "pending
    // review" etc.) but status_reason / admin_notes / reviewed_by
    // are NOT — those are internal.
    status: row.status,
    submitted_at: row.submitted_at,
    approved_at: row.approved_at,
    // Payment flag only, not the raw customer id / funding source URL
    payment_verified: !!row.dwolla_verified_at,
    payout_status: row.payout_status,
    // Agreement metadata — the "which version am I on" is
    // partner-visible; full agreement history stays admin-only
    current_agreement_version: row.current_agreement_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
