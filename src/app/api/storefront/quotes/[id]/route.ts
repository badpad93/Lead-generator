import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { resolveTenantByOwner } from "@/lib/storefront/tenants";
import { getQuote, updateDraftQuote, type QuoteLineDraft } from "@/lib/storefront/quotes";
import { quoteErrorResponse } from "../route";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No storefront" }, { status: 403 });
  const { id } = await params;
  try {
    return NextResponse.json(await getQuote(tenant.id, id));
  } catch (err) {
    return quoteErrorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await resolveTenantByOwner(userId);
  if (!tenant) return NextResponse.json({ error: "No storefront" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    selected_tier?: number;
    lines?: QuoteLineDraft[];
    notes?: string | null;
  };
  try {
    const result = await updateDraftQuote(tenant.id, id, {
      selectedTier: body.selected_tier,
      lines: body.lines,
      notes: body.notes,
    });
    return NextResponse.json(result);
  } catch (err) {
    return quoteErrorResponse(err);
  }
}
