import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const YAHOO_CLIENT_ID = process.env.YAHOO_CLIENT_ID!;
const YAHOO_CLIENT_SECRET = process.env.YAHOO_CLIENT_SECRET!;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vendingconnector.com";

interface YahooTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
}

interface YahooUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const stateParam = params.get("state");
  const error = params.get("error");

  if (error) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent("Missing authorization code from Yahoo")}`
    );
  }

  let state: { flow: string; role: string };
  try {
    state = JSON.parse(Buffer.from(stateParam, "base64url").toString());
  } catch {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent("Invalid state parameter")}`
    );
  }

  const redirectUri = `${APP_URL}/api/auth/yahoo/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://api.login.yahoo.com/oauth2/get_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${YAHOO_CLIENT_ID}:${YAHOO_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent("Failed to exchange Yahoo authorization code")}`
    );
  }

  const tokens: YahooTokenResponse = await tokenRes.json();

  // Get user info
  const userInfoRes = await fetch("https://api.login.yahoo.com/openid/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userInfoRes.ok) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent("Failed to get Yahoo user info")}`
    );
  }

  const yahooUser: YahooUserInfo = await userInfoRes.json();

  if (!yahooUser.email) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent("Yahoo account does not have an email address")}`
    );
  }

  // Find or create user in Supabase
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find(
    (u) => u.email === yahooUser.email
  );

  if (!existingUser) {
    const password = randomUUID() + randomUUID();
    const fullName = yahooUser.name || [yahooUser.given_name, yahooUser.family_name].filter(Boolean).join(" ") || yahooUser.email.split("@")[0];

    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: yahooUser.email,
      email_confirm: true,
      password,
      user_metadata: {
        full_name: fullName,
        role: state.role || undefined,
        avatar_url: yahooUser.picture || undefined,
        provider: "yahoo",
      },
    });

    if (createErr) {
      return NextResponse.redirect(
        `${APP_URL}/login?error=${encodeURIComponent(createErr.message || "Failed to create account")}`
      );
    }
  }

  // Generate a magic link to create a valid Supabase session
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: yahooUser.email,
  });

  if (linkErr || !linkData) {
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent("Failed to create session")}`
    );
  }

  // Redirect to Supabase's token verification endpoint which establishes the session
  const verifyUrl = new URL(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/verify`);
  verifyUrl.searchParams.set("token", linkData.properties.hashed_token);
  verifyUrl.searchParams.set("type", "magiclink");

  const callbackUrl = new URL(`${APP_URL}/auth/callback`);
  callbackUrl.searchParams.set("flow", state.flow);
  if (state.role) callbackUrl.searchParams.set("role", state.role);
  verifyUrl.searchParams.set("redirect_to", callbackUrl.toString());

  return NextResponse.redirect(verifyUrl.toString());
}
