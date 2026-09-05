import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import { createQuote, listQuotes, QuoteError, type QuoteLineDraft } from "@/lib/storefront/quotes";

/**
 * Operator quotes collection. Tenant scope is derived from the
 * AUTHENTICATED owner — never from the client — so an operator can only
 * ever list/create quotes for their own storefront.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No storefront" }, { status: 403 });
  return NextResponse.json({ quotes: await listQuotes(tenant.id) });
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No storefront" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    customer_profile_id?: string | null;
    prospect?: Record<string, string | null> | null;
    notes?: string | null;
    selected_tier?: number;
    lines?: QuoteLineDraft[];
  };
  try {
    const result = await createQuote({
      tenantId: tenant.id,
      createdBy: userId,
      customerProfileId: body.customer_profile_id ?? null,
      prospect: body.prospect ?? null,
      notes: body.notes ?? null,
      selectedTier: Number(body.selected_tier ?? 1),
      lines: Array.isArray(body.lines) ? body.lines : [],
    });
    return NextResponse.json(result);
  } catch (err) {
    return quoteErrorResponse(err);
  }
}

export function quoteErrorResponse(err: unknown): NextResponse {
  if (err instanceof QuoteError) {
    const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: err.message, code: err.code }, { status });
  }
  console.error("[storefront/quotes] failed", err);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
