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

  const authUrl = new URL("https://api.login.yahoo.com/oauth2/request_auth");
  authUrl.searchParams.set("client_id", YAHOO_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
