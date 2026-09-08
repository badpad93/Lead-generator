import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getAccountingApiBase } from "@/lib/quickbooks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { QB_OAUTH_STATE_COOKIE, verifyOAuthState } from "@/lib/quickbooksOAuthState";

/**
 * Intuit redirects here after the admin authorizes. Order of operations
 * is deliberate:
 *   1. the signed state must match the httpOnly cookie and be unexpired;
 *   2. the initiating user must still be an admin;
 *   3. the code is exchanged and company info fetched;
 *   4. only then is the single connection row replaced — by updating it in
 *      place when one exists, so a failed exchange never leaves the
 *      integration disconnected.
 */
function redirectAdmin(siteUrl: string, params: Record<string, string>): NextResponse {
  const q = new URLSearchParams(params).toString();
  const res = NextResponse.redirect(`${siteUrl}/admin?${q}`);
  res.cookies.set(QB_OAUTH_STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/quickbooks/oauth", maxAge: 0 });
  return res;
}

async function isStillAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
  return (data as { role?: string } | null)?.role === "admin";
}

async function fetchCompanyName(realmId: string, accessToken: string): Promise<string> {
  try {
    const infoRes = await fetch(`${getAccountingApiBase()}/v3/company/${realmId}/companyinfo/${realmId}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    if (!infoRes.ok) return "";
    const infoData = await infoRes.json();
    return infoData.CompanyInfo?.CompanyName || "";
  } catch {
    return ""; // nice-to-have
  }
}

/** Replace the single connection row without a window where none exists. */
async function persistConnection(row: { realm_id: string; access_token: string; refresh_token: string; token_expires_at: string; company_name: string }): Promise<void> {
  const { data: existing, error: readErr } = await supabaseAdmin.from("quickbooks_connection").select("id").limit(1).maybeSingle();
  if (readErr) throw new Error(`connection read failed: ${readErr.message}`);
  if (existing?.id) {
    const { error } = await supabaseAdmin.from("quickbooks_connection").update({ ...row, updated_at: new Date().toISOString() }).eq("id", existing.id);
    if (error) throw new Error(`connection update failed: ${error.message}`);
    return;
  }
  const { error } = await supabaseAdmin.from("quickbooks_connection").insert(row);
  if (error) throw new Error(`connection insert failed: ${error.message}`);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const realmId = req.nextUrl.searchParams.get("realmId");
  const error = req.nextUrl.searchParams.get("error");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";

  if (error) return redirectAdmin(siteUrl, { qb: "error", message: error });

  const state = verifyOAuthState(req.nextUrl.searchParams.get("state"), req.cookies.get(QB_OAUTH_STATE_COOKIE)?.value);
  if (!state) return redirectAdmin(siteUrl, { qb: "error", message: "Invalid or expired authorization state" });
  if (!(await isStillAdmin(state.adminUserId))) return redirectAdmin(siteUrl, { qb: "error", message: "Admin access required" });
  if (!code || !realmId) return redirectAdmin(siteUrl, { qb: "error", message: "Missing code or realmId" });

  try {
    const redirectUri = `${siteUrl}/api/quickbooks/oauth/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const companyName = await fetchCompanyName(realmId, tokens.access_token);
    await persistConnection({
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      company_name: companyName,
    });
    return redirectAdmin(siteUrl, { qb: "connected", company: companyName });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    console.error("[qb-oauth] Failed:", message);
    return redirectAdmin(siteUrl, { qb: "error", message });
  }
}
