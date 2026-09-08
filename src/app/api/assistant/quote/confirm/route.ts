import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAssistantCheckoutEnabled } from "@/lib/assistant/flags";
import { readinessFor } from "@/lib/commerce/checkout";
import { quoteRoute, readJson, requireCustomer, requireWriteTools } from "@/lib/commerce/quoteHttp";
import { confirmQuote, getOwnedQuote } from "@/lib/commerce/quotes";
import { toQuoteView } from "@/lib/commerce/quoteView";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ quote_id: z.string().uuid(), version: z.number().int().min(1) }).strict();

/**
 * POST /api/assistant/quote/confirm — explicit customer confirmation of
 * the version they saw. Re-reads every price first; a change is returned
 * for re-confirmation instead of being confirmed silently.
 */
export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    await requireWriteTools();
    const { viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => bodySchema.parse(v));
    const quote = await getOwnedQuote(body.quote_id, viewer.userId);
    const result = await confirmQuote(quote, body.version, viewer);
    const readiness = await readinessFor(result.bundle.quote, viewer, await isAssistantCheckoutEnabled());
    return NextResponse.json({ outcome: result.outcome, quote: toQuoteView(result.bundle.quote, result.bundle.lines, result.bundle.changes, readiness) });
  });
}
