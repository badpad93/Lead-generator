import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getAccountingApiBase } from "@/lib/quickbooks";
import { parseQuickBooksRealmId } from "@/lib/quickbooksRealmId";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Company name is nice-to-have: any failure yields "". The realm id has
 * already been validated as ASCII digits, so it cannot alter the host or
 * path of the request; it is still encoded as a path segment.
 */
async function fetchCompanyName(realmId: string, accessToken: string): Promise<string> {
  const realm = encodeURIComponent(realmId);
  try {
    const infoRes = await fetch(`${getAccountingApiBase()}/v3/company/${realm}/companyinfo/${realm}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!infoRes.ok) return "";
    const infoData = await infoRes.json();
    return infoData.CompanyInfo?.CompanyName || "";
  } catch {
    return "";
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const rawRealmId = req.nextUrl.searchParams.get("realmId");
  const error = req.nextUrl.searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  if (error) {
    return NextResponse.redirect(`${siteUrl}/admin?qb=error&message=${encodeURIComponent(error)}`);
  }

  if (!code || !rawRealmId) {
    return NextResponse.redirect(`${siteUrl}/admin?qb=error&message=Missing+code+or+realmId`);
  }

  // Validate before the token exchange and before any URL is built from it.
  const realmId = parseQuickBooksRealmId(rawRealmId);
  if (!realmId) {
    return NextResponse.redirect(`${siteUrl}/admin?qb=error&message=Invalid+realmId`);
  }

  try {
    const redirectUri = `${siteUrl}/api/quickbooks/oauth/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    const companyName = await fetchCompanyName(realmId, tokens.access_token);

    // Upsert connection (delete old, insert new — only one connection at a time)
    await supabaseAdmin.from("quickbooks_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabaseAdmin.from("quickbooks_connection").insert({
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
      company_name: companyName,
    });

    return NextResponse.redirect(`${siteUrl}/admin?qb=connected&company=${encodeURIComponent(companyName)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    console.error("[qb-oauth] Failed:", message);
    return NextResponse.redirect(`${siteUrl}/admin?qb=error&message=${encodeURIComponent(message)}`);
  }
}
