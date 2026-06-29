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

  // Build the query string manually so spaces in the scope are encoded as
  // %20 rather than the URLSearchParams default of '+'. Yahoo's OAuth
  // endpoint rejects '+' in the scope param with invalid_scope.
  const qs = [
    `client_id=${encodeURIComponent(YAHOO_CLIENT_ID)}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
    `response_type=code`,
    `scope=${encodeURIComponent("openid email profile")}`,
    `state=${encodeURIComponent(state)}`,
  ].join("&");

  return NextResponse.redirect(`https://api.login.yahoo.com/oauth2/request_auth?${qs}`);
}
