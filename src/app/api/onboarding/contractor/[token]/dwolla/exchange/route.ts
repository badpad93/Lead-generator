import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { hashToken } from "@/lib/contractorOnboarding/token";
import { exchangePublicToken, createDwollaProcessorToken } from "@/lib/plaid";
import {
  createReceiveOnlyCustomer,
  attachFundingSourceFromPlaid,
} from "@/lib/dwolla";

/**
 * POST /api/onboarding/contractor/[token]/dwolla/exchange
 *
 * Completes the Plaid + Dwolla flow. Body:
 *   { public_token: string, account_id: string,
 *     institution_name?: string, payee_legal_name?: string,
 *     business_name?: string }
 *
 * Steps:
 *   1. Plaid public_token → access_token (single-use, not stored)
 *   2. Plaid /processor/token/create for Dwolla
 *   3. Dwolla receive-only customer (created once, then reused)
 *   4. Dwolla funding source attached from processor token
 *   5. Stamp onboarding row with dwolla_customer_id +
 *      dwolla_funding_source_url + dwolla_verified_at, and mirror
 *      payee_legal_name for the PDF packet
 *
 * Raw routing / account numbers never touch our servers — Plaid
 * verifies them and Dwolla holds the funding source.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const hash = hashToken(token);
  const { data: row } = await supabaseAdmin
    .from("contractor_onboarding")
    .select(
      "id, contractor_email, contractor_name, contractor_business_name, dwolla_customer_id, status, locked, token_expires_at",
    )
    .eq("token_hash", hash)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  if (row.locked || row.status === "completed") {
    return NextResponse.json({ error: "This packet is locked." }, { status: 409 });
  }
  if (row.status === "revoked") {
    return NextResponse.json({ error: "This link has been cancelled." }, { status: 410 });
  }
  if (new Date(row.token_expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  const body = await req.json().catch(() => ({}));
  const publicToken = typeof body.public_token === "string" ? body.public_token : "";
  const accountId = typeof body.account_id === "string" ? body.account_id : "";
  const institutionName =
    typeof body.institution_name === "string" ? body.institution_name : "Bank account";
  const payeeLegalName =
    typeof body.payee_legal_name === "string" ? body.payee_legal_name.trim() : "";
  const businessName =
    typeof body.business_name === "string" ? body.business_name.trim() : "";

  if (!publicToken || !accountId) {
    return NextResponse.json({ error: "public_token and account_id are required" }, { status: 400 });
  }

  try {
    // 1 + 2: Plaid exchange → processor token
    const exchanged = await exchangePublicToken(publicToken);
    const processor = await createDwollaProcessorToken({
      accessToken: exchanged.access_token,
      accountId,
    });

    // 3: Ensure Dwolla customer exists (reuse if the contractor has
    // one from a prior partial run — Dwolla resource is idempotent
    // by our correlationId).
    let dwollaCustomerId = row.dwolla_customer_id as string | null;
    if (!dwollaCustomerId) {
      const fullName = (payeeLegalName || row.contractor_name || "Contractor").trim();
      const [firstName, ...rest] = fullName.split(/\s+/);
      const lastName = rest.join(" ") || firstName;
      const created = await createReceiveOnlyCustomer({
        firstName: firstName || "Contractor",
        lastName: lastName || "Contractor",
        email: row.contractor_email,
        businessName: businessName || row.contractor_business_name || undefined,
        correlationId: row.id,
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

    // 5: Stamp the onboarding row
    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      dwolla_customer_id: dwollaCustomerId,
      dwolla_funding_source_url: funding.fundingSourceUrl,
      dwolla_verified_at: nowIso,
      updated_at: nowIso,
    };
    if (payeeLegalName) patch.payee_legal_name = payeeLegalName;
    if (businessName) patch.contractor_business_name = businessName;

    await supabaseAdmin.from("contractor_onboarding").update(patch).eq("id", row.id);

    return NextResponse.json({ payment_verified: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[contractor-onboarding/dwolla/exchange] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
