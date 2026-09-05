import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { acceptQuoteByToken, QuoteError } from "@/lib/storefront/quotes";

/**
 * Accept a quote by its public token. Auth is OPTIONAL: a signed-in
 * customer's acceptance assigns/keeps their tier immediately; an
 * unauthenticated prospect gets the enrollment path from the page. The
 * token is the credential; tenant is derived from the quote server-side.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = await getUserIdFromRequest(req); // may be null (prospect)
  try {
    const { tenantId } = await acceptQuoteByToken(token, userId);
    const { data: tenant } = await supabaseAdmin
      .from("storefront_tenants")
      .select("slug")
      .eq("id", tenantId)
      .maybeSingle();
    const slug = (tenant as { slug?: string } | null)?.slug ?? null;
    return NextResponse.json({ ok: true, tenant_slug: slug });
  } catch (err) {
    if (err instanceof QuoteError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.code === "NOT_FOUND" ? 404 : 400 });
    }
    console.error("[coffee/quote/accept] failed", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
