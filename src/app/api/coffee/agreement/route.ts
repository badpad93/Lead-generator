import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { getActiveTemplate, getOrStartAgreement } from "@/lib/placementAgreements";

/**
 * GET /api/coffee/agreement
 *
 * Returns the currently-active coffee supply agreement template + the
 * calling operator's user_agreements row (creating a not_started row on
 * first hit). Also returns lightweight profile fields (business name,
 * shipping address) so the sign page can prefill the customer-name /
 * address blocks from the coffee application data the operator already
 * gave us.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const template = await getActiveTemplate("coffee_supply");
  if (!template) {
    return NextResponse.json(
      { error: "No active Equipment Loan & Beverage Supply Agreement template" },
      { status: 500 },
    );
  }

  const start = await getOrStartAgreement(userId, "coffee_supply");
  if (!start) {
    return NextResponse.json({ error: "Could not initialize agreement" }, { status: 500 });
  }

  // Prefill hints — read from the most recent coffee_applications row
  // (that's where the business name + shipping address were captured) and
  // fall back to the profile.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle();

  const { data: application } = await supabaseAdmin
    .from("coffee_applications")
    .select("business_name, contact_name, shipping_address, shipping_city, shipping_state, shipping_zip")
    .eq("operator_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    template: start.template,
    agreement: start.agreement,
    prefill: {
      full_name: profile?.full_name || "",
      email: profile?.email || "",
      business_name: application?.business_name || "",
      contact_name: application?.contact_name || profile?.full_name || "",
      customer_address: [
        application?.shipping_address,
        application?.shipping_city,
        application?.shipping_state,
        application?.shipping_zip,
      ].filter(Boolean).join(", "),
    },
  });
}
