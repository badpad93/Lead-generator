import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reconcileQuoteStatus, readinessFor } from "@/lib/commerce/checkout";
import { checkoutAccessFor, quoteRoute, readJson, requireCustomer } from "@/lib/commerce/quoteHttp";
import { listLines } from "@/lib/commerce/quotes";
import { toQuoteView } from "@/lib/commerce/quoteView";
import { QuoteError } from "@/lib/commerce/quoteTypes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ quote_id: z.string().uuid() }).strict();

/**
 * POST /api/assistant/quote/status — owner-initiated, read-only
 * reconciliation of one quote's stored invoice. Rate limited per quote
 * through status_reconciled_at (one lookup per minute) and in-process per
 * user. Production only: elsewhere it reports "unavailable" without
 * touching QuickBooks. Never modifies any other quote or table, and the
 * existing global QuickBooks webhook is untouched.
 */
const PER_USER_PER_MINUTE = 10;
const recent = new Map<string, number[]>();

function assertUserBudget(userId: string, now: number): void {
  const window = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (window.length >= PER_USER_PER_MINUTE) throw new QuoteError("rate_limited", "Too many status checks. Please try again in a minute.", { retry_after_seconds: 60 });
  window.push(now);
  recent.set(userId, window);
}

export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    const { viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => bodySchema.parse(v));
    assertUserBudget(viewer.userId, Date.now());
    const result = await reconcileQuoteStatus(body.quote_id, viewer);
    if (result.outcome === "throttled") {
      return NextResponse.json({ outcome: "throttled", retry_after_seconds: result.retry_after_seconds }, { status: 429, headers: { "Retry-After": String(result.retry_after_seconds) } });
    }
    const readiness = await readinessFor(result.quote, viewer, await checkoutAccessFor(viewer.userId));
    const view = toQuoteView(result.quote, await listLines(result.quote.id), [], readiness);
    return NextResponse.json({ outcome: result.outcome, quote: view, ...(result.outcome === "unavailable" ? { reason: result.reason } : {}) });
  });
}
