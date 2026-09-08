import { NextRequest, NextResponse } from "next/server";
import { getOAuthUrl } from "@/lib/quickbooks";
import { getAdminUserId } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
  const redirectUri = `${siteUrl}/api/quickbooks/oauth/callback`;
  const state = crypto.randomUUID();

  const url = getOAuthUrl(redirectUri, state);
  return NextResponse.json({ url, state });
}
