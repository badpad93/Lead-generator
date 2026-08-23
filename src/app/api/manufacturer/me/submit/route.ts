import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";

/**
 * POST /api/manufacturer/me/submit
 *
 * Flips the caller's application from draft/changes_requested →
 * submitted. Server-side revalidates the whole packet so an admin
 * never sees an incomplete submission. Returns 400 with a `missing`
 * list on incomplete state so the wizard can highlight what's left.
 */
export async function POST(req: NextRequest) {
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
      { error: "This application has already been submitted." },
      { status: 409 },
    );
  }

  const missing = validateReadiness(partner);

  // Equipment gate: at least one approved-or-pending equipment row.
  const { count: eqCount } = await supabaseAdmin
    .from("machine_listings")
    .select("id", { count: "exact", head: true })
    .eq("manufacturer_partner_id", userId)
    .in("status", ["draft", "pending_review", "approved", "active", "changes_requested"]);
  if (!eqCount || eqCount < 1) {
    missing.push("At least one equipment listing (Step 4)");
  }

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Please complete the fields below before submitting.", missing },
      { status: 400 },
    );
  }

  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from("manufacturer_partners")
    .update({
      status: "submitted",
      submitted_at: nowIso,
      status_reason: null,
      updated_at: nowIso,
    })
    .eq("id", userId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Any draft equipment auto-advances to pending_review at submit.
  await supabaseAdmin
    .from("machine_listings")
    .update({ status: "pending_review", updated_at: nowIso })
    .eq("manufacturer_partner_id", userId)
    .eq("status", "draft");

  return NextResponse.json({ status: "submitted", submitted_at: nowIso });
}

function validateReadiness(partner: Record<string, unknown>): string[] {
  const missing: string[] = [];
  const str = (k: string): string =>
    typeof partner[k] === "string" ? (partner[k] as string).trim() : "";

  // Step 1
  if (!str("legal_company_name")) missing.push("Legal company name (Step 1)");
  if (!str("primary_contact_email")) missing.push("Primary contact email (Step 1)");
  if (!str("primary_contact_name")) missing.push("Primary contact name (Step 1)");
  if (!str("business_address") || !str("business_city") || !str("business_state") || !str("business_zip")) {
    missing.push("Business address (Step 1)");
  }
  // Step 2
  if (!str("shipping_origin_address")) missing.push("Shipping origin address (Step 2)");
  if (partner.order_acknowledgment_time_hours == null) missing.push("Order acknowledgment time (Step 2)");
  if (partner.shipment_lead_time_days == null) missing.push("Shipment lead time (Step 2)");
  if (!str("return_policy")) missing.push("Return policy (Step 2)");
  if (!str("warranty_summary")) missing.push("Warranty summary (Step 2)");
  if (!str("technical_contact_name") || !str("technical_contact_email")) {
    missing.push("Technical contact (Step 2)");
  }
  if (!str("escalation_contact_name") || !str("escalation_contact_email")) {
    missing.push("Escalation contact (Step 2)");
  }
  // Step 3
  if (!str("current_agreement_version")) missing.push("Marketplace Partner Agreement (Step 3)");
  // Step 5
  if (!partner.dwolla_verified_at) missing.push("Payment setup (Step 5)");

  return missing;
}
