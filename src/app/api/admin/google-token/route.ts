import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getAdminUserId } from "@/lib/adminAuth";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
}

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set" }, { status: 500 });
  }

  const code = req.nextUrl.searchParams.get("code");

  if (code) {
    const oauth2 = new google.auth.OAuth2(
      clientId,
      clientSecret,
      `${getSiteUrl()}/api/admin/google-token`
    );
    try {
      const { tokens } = await oauth2.getToken(code);
      return NextResponse.json({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        expiry_date: tokens.expiry_date,
        message: tokens.refresh_token
          ? "Copy the refresh_token value and set it as GOOGLE_OAUTH_REFRESH_TOKEN in your environment variables."
          : "No refresh_token returned — you may need to revoke app access at https://myaccount.google.com/permissions and try again.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Token exchange failed: ${msg}` }, { status: 500 });
    }
  }

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${getSiteUrl()}/api/admin/google-token`
  );

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  return NextResponse.json({ auth_url: url });
}
