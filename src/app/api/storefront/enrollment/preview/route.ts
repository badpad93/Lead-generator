import { NextRequest, NextResponse } from "next/server";
import { previewInvitationByToken } from "@/lib/storefront/enrollment";
import { isStorefrontFlagEnabled } from "@/lib/storefront/flags";

/**
 * Public token-preview endpoint for the /coffee/invite/[token]
 * landing page. Reports invitation state flags (expired / revoked /
 * used) and a redacted tenant summary so the page can render
 * "You've been invited to ACME Coffee — Continue" (or the error
 * variant) before the user signs in.
 */
export async function GET(req: NextRequest) {
  // Fail-closed kill switch. Return the same 404 as a
  // token-not-found so a disabled enrollment surface cannot be
  // distinguished from an invalid token.
  if (!(await isStorefrontFlagEnabled("storefront.enrollment_enabled"))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  const preview = await previewInvitationByToken(token);
  if (!preview) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(preview);
}
