import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

export async function GET(req: NextRequest) {
  if (!YAHOO_CLIENT_ID) {
    return NextResponse.json({ error: "Yahoo OAuth not configured" }, { status: 500 });
  }

  const params = req.nextUrl.searchParams;
  const flow = params.get("flow") || "login";
  const role = params.get("role") || "";

  const state = Buffer.from(
    JSON.stringify({ flow, role, nonce: crypto.randomBytes(16).toString("hex") })
  ).toString("base64url");

  const redirectUri = `${APP_URL}/api/auth/yahoo/callback`;
  const nonce = crypto.randomBytes(16).toString("hex");

  // Yahoo OIDC requires the nonce param. Start with the minimum scope
  // (openid) to confirm OIDC is wired up on the app; once that succeeds
  // we can layer in 'email' and 'profile' (which need the matching
  // OpenID Connect Permissions enabled in the Yahoo Developer Console).
  const qs = [
    `client_id=${encodeURIComponent(YAHOO_CLIENT_ID)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `response_type=code`,
    `scope=${encodeURIComponent("openid email profile")}`,
    `nonce=${encodeURIComponent(nonce)}`,
    `state=${encodeURIComponent(state)}`,
  ].join("&");

  return NextResponse.redirect(`https://api.login.yahoo.com/oauth2/request_auth?${qs}`);
}
