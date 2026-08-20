import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/contractorOnboarding/token";
import { generateContractorPacketPdf } from "@/lib/pdf/contractorOnboardingPdf";
import {
  sendContractorCompletionNotification,
  CONTRACTOR_ONBOARDING_NOTIFY,
} from "@/lib/contractorOnboarding/emails";
import {
  SIGNED_DOCUMENTS,
  SALES_POLICY_ACKNOWLEDGMENTS,
  type SignedDocumentKey,
} from "@/lib/contractorOnboarding/legal";

/**
 * POST /api/onboarding/contractor/[token]/finish
 *
 * Body:
 *   {
 *     typed_name: string,            // legal signature name
 *     signature_data?: string,       // base64 PNG when drawn
 *     signature_type: "typed" | "drawn",
 *     reviewed: true                 // client-side gate; server re-checks
 *   }
 *
 * Order of operations (each safe under retry — the endpoint returns
 * 409 on the "already locked" case, and packet_pdf_storage_path
 * upserts):
 *   1. Re-validate every prerequisite on the server.
 *   2. Insert one signature row per document (idempotent per
 *      onboarding_id + document_key + document_version).
 *   3. Generate the packet PDF, upload to the private bucket.
 *   4. Update the row: locked=true, status='completed',
 *      completed_at, packet_pdf_storage_path.
 *   5. Fire the completion notification to the 3 leadership
 *      recipients — link only, no sensitive data embedded.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const hash = hashToken(token);
  const { data: row, error: rowErr } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (row.locked || row.status === "completed") {
    return NextResponse.json({ error: "Already submitted." }, { status: 409 });
  }
  if (row.status === "revoked") {
    return NextResponse.json({ error: "This link has been cancelled." }, { status: 410 });
  }
  if (new Date(row.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  const body = await req.json().catch(() => ({}));
  const typedName = typeof body.typed_name === "string" ? body.typed_name.trim() : "";
  const signatureType = body.signature_type === "drawn" ? "drawn" : "typed";
  const signatureData =
    typeof body.signature_data === "string" && body.signature_data.startsWith("data:image/")
      ? body.signature_data
      : null;
  const reviewed = body.reviewed === true;

  if (!typedName) {
    return NextResponse.json({ error: "Please type your legal name to sign." }, { status: 400 });
  }
  if (!reviewed) {
    return NextResponse.json({ error: "Please confirm the review checkbox." }, { status: 400 });
  }
  if (signatureType === "drawn" && !signatureData) {
    return NextResponse.json({ error: "Drawn signature is missing." }, { status: 400 });
  }

  // Server-side revalidation of every required step.
  const stepData = (row.step_data ?? {}) as Record<string, unknown>;
  const missing = requiredMissing(row, stepData);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Onboarding is incomplete.", missing },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ua = req.headers.get("user-agent") ?? null;
  const nowIso = new Date().toISOString();

  // 2. Insert one signature row per document. UNIQUE index on
  //    (onboarding_id, document_key, document_version) makes retries
  //    safe — a resubmit after a mid-flow failure won't duplicate.
  const signatureRows = SIGNED_DOCUMENTS.map((docKey) => ({
    onboarding_id: row.id,
    document_key: docKey,
    document_version: row.agreement_version,
    signature_type: signatureType,
    typed_name: typedName,
    signature_data: signatureData,
    ip_address: ip,
    user_agent: ua,
    signed_at: nowIso,
  }));

  const { error: sigErr } = await supabaseAdmin
    .from("contractor_onboarding_signatures")
    .upsert(signatureRows, { onConflict: "onboarding_id,document_key,document_version" });
  if (sigErr) {
    return NextResponse.json({ error: sigErr.message }, { status: 500 });
  }

  // 3. Read back the persisted signatures (source of truth for PDF)
  const { data: persistedSigs } = await supabaseAdmin
    .from("contractor_onboarding_signatures")
    .select("document_key, document_version, signature_type, typed_name, ip_address, user_agent, signed_at")
    .eq("onboarding_id", row.id)
    .order("document_key");

  const pdfBytes = await generateContractorPacketPdf({
    contractorName: typedName || row.contractor_name || "Contractor",
    payeeLegalName: (stepData.payee_legal_name as string) ?? row.payee_legal_name ?? null,
    businessName: (stepData.contractor_business_name as string) ?? row.contractor_business_name ?? null,
    contractorEmail: row.contractor_email,
    mailingAddress: (stepData.mailing_address as string) ?? row.mailing_address ?? null,
    mailingCity: (stepData.mailing_city as string) ?? row.mailing_city ?? null,
    mailingState: (stepData.mailing_state as string) ?? row.mailing_state ?? null,
    mailingZip: (stepData.mailing_zip as string) ?? row.mailing_zip ?? null,
    phoneNumber: (stepData.phone_number as string) ?? row.phone_number ?? null,
    stateOfResidence: (stepData.state_of_residence as string) ?? row.state_of_residence ?? null,
    startDate: row.start_date,
    completedAt: nowIso,
    agreementVersion: row.agreement_version,
    paymentVerifiedAt: row.dwolla_verified_at,
    salesPolicyAcks: (stepData.sales_policy_acknowledgments as Record<string, boolean>) ?? {},
    signatures: (persistedSigs ?? []).map((s) => ({
      document_key: s.document_key,
      document_version: s.document_version,
      signature_type: s.signature_type as "typed" | "drawn",
      typed_name: s.typed_name,
      ip_address: s.ip_address ? String(s.ip_address) : null,
      user_agent: s.user_agent,
      signed_at: s.signed_at,
    })),
  });

  const safeName = safeFileName(typedName || row.contractor_name || "Contractor");
  const dateStamp = nowIso.slice(0, 10);
  const packetPath = `${row.id}/packet/Apex_Contractor_Onboarding_${safeName}_${dateStamp}.pdf`;

  const { error: uploadErr } = await supabaseAdmin
    .storage
    .from("contractor-onboarding-documents")
    .upload(packetPath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // 4. Lock the row and mark completed. If team_member_id was null
  //    at invite time, try to link it to a profile matching the
  //    contractor's email so the Team page can surface the status.
  let teamMemberId = row.team_member_id as string | null;
  if (!teamMemberId) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", row.contractor_email)
      .maybeSingle();
    if (profile?.id) teamMemberId = profile.id;
  }

  const { error: lockErr } = await supabaseAdmin
    .from("contractor_onboarding")
    .update({
      locked: true,
      status: "completed",
      completed_at: nowIso,
      packet_pdf_storage_path: packetPath,
      team_member_id: teamMemberId,
      updated_at: nowIso,
    })
    .eq("id", row.id);
  if (lockErr) {
    return NextResponse.json({ error: lockErr.message }, { status: 500 });
  }

  // 5. Notify the three leadership recipients (hardcoded — see
  //    CONTRACTOR_ONBOARDING_NOTIFY). Best-effort; a failure here
  //    doesn't unwind the submission.
  const origin =
    req.headers.get("origin") ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://vendingconnector.com";
  const adminUrl = `${origin}/sales/team/contractor-onboarding/${row.id}`;
  try {
    await sendContractorCompletionNotification({
      contractorName: typedName || row.contractor_name || row.contractor_email,
      contractorEmail: row.contractor_email,
      startDate: row.start_date,
      completedAt: nowIso,
      adminUrl,
    });
  } catch (mailErr) {
    console.error("[contractor-onboarding/finish] leadership notify failed:", mailErr);
  }

  // Universal audit log entry (best-effort).
  try {
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: null,
      action: "contractor_onboarding_completed",
      entity_type: "contractor_onboarding",
      entity_id: row.id,
      metadata: {
        contractor_email: row.contractor_email,
        signature_type: signatureType,
        ip: ip,
        recipients_notified: CONTRACTOR_ONBOARDING_NOTIFY,
      },
    });
  } catch (auditErr) {
    console.error("[contractor-onboarding/finish] audit log failed:", auditErr);
  }

  return NextResponse.json({ success: true, completed_at: nowIso });
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

interface RowLike {
  w9_uploaded_at?: string | null;
  dwolla_verified_at?: string | null;
}

function requiredMissing(row: RowLike, stepData: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const stringField = (k: string): string =>
    typeof stepData[k] === "string" ? (stepData[k] as string).trim() : "";
  if (!stringField("full_legal_name")) missing.push("full_legal_name");
  if (!stringField("mailing_address")) missing.push("mailing_address");
  if (!stringField("mailing_city")) missing.push("mailing_city");
  if (!stringField("mailing_state")) missing.push("mailing_state");
  if (!stringField("mailing_zip")) missing.push("mailing_zip");
  if (!stringField("phone_number")) missing.push("phone_number");
  if (!stringField("state_of_residence")) missing.push("state_of_residence");
  if (!stepData.ica_accepted) missing.push("independent_contractor_agreement_acceptance");
  if (!stepData.confidentiality_accepted) missing.push("confidentiality_acceptance");

  const acks = (stepData.sales_policy_acknowledgments as Record<string, boolean> | undefined) ?? {};
  const missingAcks = SALES_POLICY_ACKNOWLEDGMENTS.filter((a) => !acks[a]);
  if (missingAcks.length > 0) missing.push("sales_policy_acknowledgments");

  if (!stepData.commission_acknowledged) missing.push("commission_acknowledged");
  // W-9 upload + bank/payment setup are collected outside the packet
  // flow now — see 2026-01-v1: the digital packet only carries the
  // agreements + acknowledgments. Do NOT gate finish on w9_uploaded_at
  // or dwolla_verified_at.

  return missing;
}

function safeFileName(name: string): string {
  return name.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Contractor";
}

// Re-export for type completeness — tsc otherwise strips the import
// when it's used only as a value indirectly through iteration.
export type _SignedDoc = SignedDocumentKey;
