import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import {
  AGREEMENT_VERSION,
  type AgreementSigningInput,
} from "@/lib/manufacturerOnboarding/legal";
import { generateManufacturerAgreementPdf } from "@/lib/pdf/manufacturerAgreementPdf";

/**
 * Manufacturer Marketplace Partner Agreement — accept endpoint.
 *
 *   POST body:
 *     {
 *       shipping_charges_method: string,
 *       returns_cancellation_terms: string,
 *       liability_cap_modification: string,
 *       exclusivity_terms: string,
 *       integration_notes: string,
 *       order_acknowledgment_target: string,
 *       shipment_target: string,
 *       manufacturer_escalation_contact: string,
 *       manufacturer_technical_contact: string,
 *       signer_printed_name: string,
 *       signer_title: string,
 *       signature_type: "typed" | "drawn",
 *       signature_data?: string  // base64 PNG when drawn
 *     }
 *
 * Order of operations:
 *   1. Validate the partner exists + is in draft/changes_requested.
 *   2. Validate all required signing fields + earlier-step
 *      prerequisites (legal name, address). If Step 1/2 aren't
 *      complete, refuse with a `missing` list so the wizard can
 *      show what's incomplete.
 *   3. Insert manufacturer_agreements row (UNIQUE guard on
 *      partner+version — retries return the existing row).
 *   4. Generate the PDF, upload to the private bucket at
 *      {partner_id}/agreements/Marketplace_Agreement_{version}_{ts}.pdf.
 *   5. Stamp executed_pdf_storage_path on the agreement row + set
 *      manufacturer_partners.current_agreement_version.
 *   6. Return { accepted_at, agreement_version }.
 *
 * Same top-level try/catch pattern as contractor-onboarding finish:
 * any unhandled throw returns a clean JSON 500 (no HTML error pages
 * blowing up the client's JSON parse).
 */

const BUCKET = "manufacturer-partner-docs";

export async function POST(req: NextRequest) {
  try {
    return await handleAccept(req);
  } catch (err) {
    console.error("[manufacturer/agreement] unhandled:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET — returns the latest active agreement metadata for the caller
 * (without the raw storage path — that goes through the download
 * endpoint in commit 8).
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data } = await supabaseAdmin
    .from("manufacturer_agreements")
    .select("id, agreement_version, effective_date, accepted_at, signer_printed_name, signer_title, superseded_at")
    .eq("manufacturer_partner_id", userId)
    .is("superseded_at", null)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ agreement: data, current_version: AGREEMENT_VERSION });
}

async function handleAccept(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (!partner) return NextResponse.json({ error: "No partner record yet" }, { status: 404 });

  if (partner.status !== "draft" && partner.status !== "changes_requested") {
    return NextResponse.json(
      { error: "This application is locked from further edits." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const signing = normalizeSigning(body);
  const missing = validateAcceptance(partner, signing);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Please complete the fields below before accepting.", missing },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent") ?? null;
  const nowIso = new Date().toISOString();
  const effectiveDateIso = nowIso.slice(0, 10);

  // Idempotent insert on (partner_id, version). If the manufacturer
  // clicks Accept twice we return the existing row without a second
  // PDF generation.
  const { data: existing } = await supabaseAdmin
    .from("manufacturer_agreements")
    .select("id, executed_pdf_storage_path")
    .eq("manufacturer_partner_id", userId)
    .eq("agreement_version", AGREEMENT_VERSION)
    .maybeSingle();

  let agreementId: string;
  if (existing) {
    agreementId = existing.id as string;
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("manufacturer_agreements")
      .insert({
        manufacturer_partner_id: userId,
        agreement_version: AGREEMENT_VERSION,
        effective_date: effectiveDateIso,
        signer_printed_name: signing.signer_printed_name,
        signer_title: signing.signer_title,
        signature_type: signing.signature_type,
        signature_data: signing.signature_data,
        ip_address: ip,
        user_agent: ua,
        accepted_at: nowIso,
        vc_operating_entity: null, // stamped by PDF gen via env, not stored redundantly
        vc_address: null,
        manufacturer_legal_name: partner.legal_company_name,
        manufacturer_address: composeAddress(partner),
        shipping_charges_method: signing.shipping_charges_method,
        returns_cancellation_terms: signing.returns_cancellation_terms,
        liability_cap_modification: signing.liability_cap_modification,
        exclusivity_terms: signing.exclusivity_terms,
        integration_notes: signing.integration_notes,
        order_acknowledgment_target: signing.order_acknowledgment_target,
        shipment_target: signing.shipment_target,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      return NextResponse.json({ error: insertErr?.message ?? "Insert failed" }, { status: 500 });
    }
    agreementId = inserted.id as string;
  }

  // Generate + upload PDF (only if we don't already have one)
  let executedPath = existing?.executed_pdf_storage_path as string | null;
  if (!executedPath) {
    const pdfBytes = await generateManufacturerAgreementPdf({
      agreementVersion: AGREEMENT_VERSION,
      effectiveDate: effectiveDateIso,
      manufacturerLegalName: partner.legal_company_name,
      manufacturerAddress: composeAddress(partner),
      signing,
      ipAddress: ip,
      userAgent: ua,
      signedAt: nowIso,
    });
    const safeName = `Marketplace_Agreement_${AGREEMENT_VERSION.replace(/[^\w.\-]/g, "_")}_${effectiveDateIso}.pdf`;
    executedPath = `${userId}/agreements/${safeName}`;
    const { error: uploadErr } = await supabaseAdmin
      .storage
      .from(BUCKET)
      .upload(executedPath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

    await supabaseAdmin
      .from("manufacturer_agreements")
      .update({ executed_pdf_storage_path: executedPath })
      .eq("id", agreementId);
  }

  await supabaseAdmin
    .from("manufacturer_partners")
    .update({
      current_agreement_version: AGREEMENT_VERSION,
      updated_at: nowIso,
    })
    .eq("id", userId);

  return NextResponse.json({
    accepted_at: nowIso,
    agreement_version: AGREEMENT_VERSION,
  });
}

function normalizeSigning(body: Record<string, unknown>): AgreementSigningInput {
  const str = (k: string): string =>
    typeof body[k] === "string" ? (body[k] as string).trim() : "";
  const sigType = body.signature_type === "drawn" ? "drawn" : "typed";
  const sigData =
    typeof body.signature_data === "string" && body.signature_data.startsWith("data:image/")
      ? body.signature_data
      : null;
  return {
    shipping_charges_method: str("shipping_charges_method"),
    returns_cancellation_terms: str("returns_cancellation_terms"),
    liability_cap_modification: str("liability_cap_modification"),
    exclusivity_terms: str("exclusivity_terms"),
    integration_notes: str("integration_notes"),
    order_acknowledgment_target: str("order_acknowledgment_target"),
    shipment_target: str("shipment_target"),
    manufacturer_escalation_contact: str("manufacturer_escalation_contact"),
    manufacturer_technical_contact: str("manufacturer_technical_contact"),
    signer_printed_name: str("signer_printed_name"),
    signer_title: str("signer_title"),
    signature_type: sigType,
    signature_data: sigData,
  };
}

function validateAcceptance(
  partner: Record<string, unknown>,
  s: AgreementSigningInput,
): string[] {
  const missing: string[] = [];
  const val = (k: string): string =>
    typeof partner[k] === "string" ? (partner[k] as string).trim() : "";

  // Step 1 prerequisites
  if (!val("legal_company_name")) missing.push("Legal company name (Step 1)");
  if (!val("business_address") || !val("business_city") || !val("business_state") || !val("business_zip")) {
    missing.push("Business address (Step 1)");
  }
  // Step 2 prerequisites — enough to sign
  if (!val("shipping_origin_address")) missing.push("Shipping origin (Step 2)");

  // Agreement-required fields
  if (!s.shipping_charges_method) missing.push("Shipping charges / method");
  if (!s.returns_cancellation_terms) missing.push("Returns / cancellation terms");
  if (!s.integration_notes) missing.push("Integration method / notes");
  if (!s.order_acknowledgment_target) missing.push("Order acknowledgment target");
  if (!s.shipment_target) missing.push("Shipment target");
  if (!s.manufacturer_escalation_contact) missing.push("Manufacturer escalation contact");
  if (!s.manufacturer_technical_contact) missing.push("Manufacturer technical contact");
  if (!s.signer_printed_name) missing.push("Signer printed name");
  if (!s.signer_title) missing.push("Signer title");
  if (s.signature_type === "drawn" && !s.signature_data) missing.push("Drawn signature");

  return missing;
}

function composeAddress(partner: Record<string, unknown>): string {
  const parts = [
    partner.business_address,
    partner.business_city,
    partner.business_state,
    partner.business_zip,
    partner.business_country,
  ]
    .filter((p) => typeof p === "string" && (p as string).trim())
    .join(", ");
  return parts || "—";
}
