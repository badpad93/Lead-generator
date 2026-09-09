import { NextRequest, NextResponse } from "next/server";
import { isAssistantCheckoutEnabled, isAssistantWriteToolsEnabled } from "@/lib/assistant/flags";
import { readinessFor } from "@/lib/commerce/checkout";
import { checkoutAccessFor, quoteRoute, requireCustomer } from "@/lib/commerce/quoteHttp";
import { cancelQuote, getCurrentQuote, listLines, revalidateQuote } from "@/lib/commerce/quotes";
import { toQuoteView } from "@/lib/commerce/quoteView";

export const dynamic = "force-dynamic";

/**
 * GET  /api/assistant/quote — the signed-in customer's current quote,
 *      freshly repriced, plus the feature flags the UI needs. Never
 *      includes QuickBooks ids or the checkout URL (see /checkout).
 * DELETE — cancel the editable quote so the next change starts fresh.
 */
export async function GET(req: NextRequest) {
  return quoteRoute(async () => {
    const [writeToolsEnabled, checkoutEnabled] = await Promise.all([isAssistantWriteToolsEnabled(), isAssistantCheckoutEnabled()]);
    const { viewer } = await requireCustomer(req);
    const current = await getCurrentQuote(viewer.userId);
    if (!current) return NextResponse.json({ quote: null, flags: { write_tools_enabled: writeToolsEnabled, checkout_enabled: checkoutEnabled } });
    const editable = current.status === "draft" || current.status === "confirmed";
    const bundle = editable ? await revalidateQuote(current, viewer) : { quote: current, lines: await listLines(current.id), changes: [] };
    const readiness = await readinessFor(bundle.quote, viewer, await checkoutAccessFor(viewer.userId));
    return NextResponse.json({
      quote: toQuoteView(bundle.quote, bundle.lines, bundle.changes, readiness),
      pay_url: bundle.quote.checkout_status === "link_issued" ? bundle.quote.checkout_url : null,
      flags: { write_tools_enabled: writeToolsEnabled, checkout_enabled: checkoutEnabled },
    });
  });
}

export async function DELETE(req: NextRequest) {
  return quoteRoute(async () => {
    const { viewer } = await requireCustomer(req);
    const current = await getCurrentQuote(viewer.userId);
    if (current) await cancelQuote(current);
    return NextResponse.json({ ok: true });
  });
}
