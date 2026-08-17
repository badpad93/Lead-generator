import { NextRequest, NextResponse } from "next/server";
import { getPlacementPartner } from "@/lib/marketplaceAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { exchangePublicToken, createDwollaProcessorToken } from "@/lib/plaid";
import {
  createReceiveOnlyCustomer,
  attachFundingSourceFromPlaid,
} from "@/lib/dwolla";

/**
 * POST /api/placement/dwolla/exchange
 *
 * Completes the Plaid + Dwolla onboarding after the PP finishes the
 * Plaid Link modal. Expects:
 *   { public_token: string, account_id: string, institution_name?: string }
 *
 * Steps:
 *   1. Plaid public_token → access_token (single-use, not stored)
 *   2. Plaid /processor/token/create for Dwolla
 *   3. Dwolla receive-only customer (idempotent per PP)
 *   4. Dwolla funding_source from Plaid processor token
 *   5. Stamp placement_partners with customer + funding source ids
 */
export async function POST(req: NextRequest) {
  const pp = await getPlacementPartner(req);
  if (!pp) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const { data: partner } = await supabaseAdmin
    .from("placement_partners")
    .select("id, dwolla_customer_id, dwolla_funding_source_id, business_name")
    .eq("id", pp.id)
    .maybeSingle();
  if (!partner) {
    return NextResponse.json({ error: "Placement partner row not found" }, { status: 404 });
  }

  try {
    // 1 + 2: Plaid exchange → processor token
    const exchanged = await exchangePublicToken(publicToken);
    const processor = await createDwollaProcessorToken({
      accessToken: exchanged.access_token,
      accountId,
    });

    // 3: Ensure Dwolla customer exists
    let dwollaCustomerId = partner.dwolla_customer_id as string | null;
    if (!dwollaCustomerId) {
      const [firstName, ...rest] = pp.full_name.trim().split(/\s+/);
      const lastName = rest.join(" ") || firstName; // Dwolla requires both
      const created = await createReceiveOnlyCustomer({
        firstName: firstName || "PP",
        lastName: lastName || "Partner",
        email: pp.email,
        businessName: partner.business_name ?? undefined,
        correlationId: pp.id,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          undefined,
      });
      dwollaCustomerId = created.customerId;
    }

    // 4: Attach funding source
    const funding = await attachFundingSourceFromPlaid({
      customerId: dwollaCustomerId,
      plaidToken: processor.processor_token,
      name: institutionName.slice(0, 50),
    });

    // 5: Persist. verified_at stamped because Plaid IAV pre-verified
    // the bank, so Dwolla doesn't run micro-deposits.
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("placement_partners")
      .update({
        dwolla_customer_id: dwollaCustomerId,
        dwolla_funding_source_id: funding.fundingSourceUrl, // full URL — that's what Dwolla wants back
        dwolla_verification_status: "verified",
        dwolla_verified_at: nowIso,
      })
      .eq("id", pp.id);

    return NextResponse.json({
      ok: true,
      dwolla_customer_id: dwollaCustomerId,
      verification_status: "verified",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dwolla/exchange] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
