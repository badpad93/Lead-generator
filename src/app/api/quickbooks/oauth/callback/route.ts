import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/quickbooks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const realmId = req.nextUrl.searchParams.get("realmId");
  const error = req.nextUrl.searchParams.get("error");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  if (error) {
    return NextResponse.redirect(`${siteUrl}/admin?qb=error&message=${encodeURIComponent(error)}`);
  }

  if (!code || !realmId) {
    return NextResponse.redirect(`${siteUrl}/admin?qb=error&message=Missing+code+or+realmId`);
  }

  try {
    const redirectUri = `${siteUrl}/api/quickbooks/oauth/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Fetch company info
    const base = process.env.QB_ENVIRONMENT === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";

    let companyName = "";
    try {
      const infoRes = await fetch(`${base}/v3/company/${realmId}/companyinfo/${realmId}`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
        },
      });
      if (infoRes.ok) {
        const infoData = await infoRes.json();
        companyName = infoData.CompanyInfo?.CompanyName || "";
      }
    } catch {
      // Company name is nice-to-have
    }

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
