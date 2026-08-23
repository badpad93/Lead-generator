import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { exchangePublicToken, createDwollaProcessorToken } from "@/lib/plaid";
import {
  createReceiveOnlyCustomer,
  attachFundingSourceFromPlaid,
} from "@/lib/dwolla";

/**
 * POST /api/manufacturer/me/dwolla/exchange
 *
 * Completes the Plaid → Dwolla dance so this manufacturer can receive
 * ACH payouts. Same behavior as the placement partner and contractor
 * onboarding exchange endpoints:
 *
 *   1. Plaid public_token → access_token (single-use, not persisted)
 *   2. Plaid /processor/token/create for Dwolla
 *   3. Ensure a Dwolla receive-only customer exists for this partner
 *   4. Attach Plaid-verified funding source
 *   5. Stamp dwolla_customer_id + dwolla_funding_source_url +
 *      dwolla_verified_at on manufacturer_partners; flip
 *      payout_status='verified'.
 *
 * Raw routing / account numbers NEVER touch our servers.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: partner } = await supabaseAdmin
    .from("manufacturer_partners")
    .select(
      "id, legal_company_name, primary_contact_email, primary_contact_name, dwolla_customer_id, status",
    )
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
  const publicToken = typeof body.public_token === "string" ? body.public_token : "";
  const accountId = typeof body.account_id === "string" ? body.account_id : "";
  const institutionName =
    typeof body.institution_name === "string" ? body.institution_name : "Bank account";
  if (!publicToken || !accountId) {
    return NextResponse.json(
      { error: "public_token and account_id are required" },
      { status: 400 },
    );
  }

  try {
    const exchanged = await exchangePublicToken(publicToken);
    const processor = await createDwollaProcessorToken({
      accessToken: exchanged.access_token,
      accountId,
    });

    let dwollaCustomerId = partner.dwolla_customer_id as string | null;
    if (!dwollaCustomerId) {
      const legalName = (partner.primary_contact_name || partner.legal_company_name || "Manufacturer").trim();
      const [firstName, ...rest] = legalName.split(/\s+/);
      const lastName = rest.join(" ") || firstName;
      const created = await createReceiveOnlyCustomer({
        firstName: firstName || "Manufacturer",
        lastName: lastName || "Partner",
        email: partner.primary_contact_email as string,
        businessName: partner.legal_company_name,
        correlationId: partner.id,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          undefined,
      });
      dwollaCustomerId = created.customerId;
    }

    const funding = await attachFundingSourceFromPlaid({
      customerId: dwollaCustomerId,
      plaidToken: processor.processor_token,
      name: institutionName.slice(0, 50),
    });

    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("manufacturer_partners")
      .update({
        dwolla_customer_id: dwollaCustomerId,
        dwolla_funding_source_url: funding.fundingSourceUrl,
        dwolla_verified_at: nowIso,
        payout_status: "verified",
        updated_at: nowIso,
      })
      .eq("id", userId);

    return NextResponse.json({ payment_verified: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[manufacturer/dwolla/exchange] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
