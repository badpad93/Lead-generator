import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * GET one contractor onboarding record. Returns admin-visible metadata
 * + signature audit rows. Never returns the token hash, the raw
 * Dwolla funding source URL, or the W-9 storage path — restricted
 * downloads flow through dedicated endpoints with signed URLs.
 *
 * Role gate: any INITIATOR role can see the summary. Restricted
 * document endpoints (W-9, packet PDF) enforce ELEVATED role on
 * their own.
 */

const INITIATOR_ROLES = new Set(["admin", "director_of_sales", "market_leader", "sales_manager"]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!INITIATOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { data: row, error } = await supabaseAdmin
    .from("contractor_onboarding")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: signatures } = await supabaseAdmin
    .from("contractor_onboarding_signatures")
    .select("document_key, document_version, signature_type, typed_name, ip_address, user_agent, signed_at")
    .eq("onboarding_id", id)
    .order("document_key");

  return NextResponse.json({
    onboarding: sanitizeForAdmin(row),
    signatures: signatures ?? [],
    viewer_role: user.role,
  });
}

// Fields returned to the admin. Deliberately drops token_hash,
// dwolla_funding_source_url (never surfaced in UI — only used
// server-side for transfers), and w9_storage_path (fetched via
// signed URL endpoint that enforces its own role gate).
function sanitizeForAdmin(row: Record<string, unknown>) {
  return {
    id: row.id,
    team_member_id: row.team_member_id,
    contractor_name: row.contractor_name,
    contractor_email: row.contractor_email,
    payee_legal_name: row.payee_legal_name,
    contractor_business_name: row.contractor_business_name,
    mailing_address: row.mailing_address,
    mailing_city: row.mailing_city,
    mailing_state: row.mailing_state,
    mailing_zip: row.mailing_zip,
    phone_number: row.phone_number,
    state_of_residence: row.state_of_residence,
    start_date: row.start_date,
    status: row.status,
    agreement_version: row.agreement_version,
    revision_of: row.revision_of,
    sent_at: row.sent_at,
    first_opened_at: row.first_opened_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    locked: row.locked,
    send_count: row.send_count,
    last_resent_at: row.last_resent_at,
    revoked_at: row.revoked_at,
    token_expires_at: row.token_expires_at,
    w9_received: !!row.w9_uploaded_at,
    w9_uploaded_at: row.w9_uploaded_at,
    w9_original_filename: row.w9_original_filename,
    payment_verified: !!row.dwolla_verified_at,
    payment_verified_at: row.dwolla_verified_at,
    packet_available: !!row.packet_pdf_storage_path,
    step_data: row.step_data,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
