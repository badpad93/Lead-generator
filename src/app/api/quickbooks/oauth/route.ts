import { NextRequest, NextResponse } from "next/server";
import { getOAuthUrl } from "@/lib/quickbooks";
import { getAdminUserId } from "@/lib/adminAuth";
import { mintOAuthState, QB_OAUTH_STATE_COOKIE, QB_OAUTH_STATE_TTL_MS } from "@/lib/quickbooksOAuthState";

/**
 * Admin-only: mint the Intuit authorization URL. The signed `state` is
 * both returned (Intuit echoes it back) and set as an httpOnly cookie so
 * the callback can prove the browser that finishes the handshake is the
 * one that started it.
 */
export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const redirectUri = `${siteUrl}/api/quickbooks/oauth/callback`;
  const state = mintOAuthState(adminId);

  const url = getOAuthUrl(redirectUri, state);
  const res = NextResponse.json({ url, state });
  res.cookies.set(QB_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/quickbooks/oauth",
    maxAge: Math.floor(QB_OAUTH_STATE_TTL_MS / 1000),
  });
  return res;
}
