import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkoutQuote, readinessFor } from "@/lib/commerce/checkout";
import { assertCheckoutAccess, checkoutAccessFor, quoteRoute, readJson, requireCheckout, requireCustomer } from "@/lib/commerce/quoteHttp";
import { getOwnedQuote, listLines } from "@/lib/commerce/quotes";
import { toQuoteView } from "@/lib/commerce/quoteView";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ quote_id: z.string().uuid(), version: z.number().int().min(1), confirm: z.literal(true) }).strict();

/**
 * POST /api/assistant/quote/checkout — called only by the Checkout button
 * after a physical click (`confirm: true`). Requires, in order:
 * assistant.enabled, assistant.checkout_enabled, a signed-in owner, a
 * verified administrator unless assistant.checkout_public_enabled, the
 * production deployment, and a confirmed, current, fully-ready quote.
 * Returns the validated QuickBooks hosted pay URL or a structured reason.
 */
export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    await requireCheckout();
    const { viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => bodySchema.parse(v));
    const access = await checkoutAccessFor(viewer.userId);
    assertCheckoutAccess(access);
    const result = await checkoutQuote(body.quote_id, viewer, body.version, access);
    if (result.outcome === "changed") {
      const readiness = await readinessFor(result.bundle.quote, viewer, access);
      return NextResponse.json({ outcome: "changed", quote: toQuoteView(result.bundle.quote, result.bundle.lines, result.bundle.changes, readiness) });
    }
    if (result.outcome === "blocked") return NextResponse.json({ outcome: "blocked", checkout: result.readiness }, { status: 409 });
    const lines = await listLines(result.quote.id);
    const readiness = await readinessFor(result.quote, viewer, access);
    return NextResponse.json({ outcome: "invoiced", pay_url: result.pay_url, quote: toQuoteView(result.quote, lines, [], readiness) });
  });
}

/** GET — re-fetch the stored pay URL after a refresh (owner only). */
export async function GET(req: NextRequest) {
  return quoteRoute(async () => {
    await requireCheckout();
    const { viewer } = await requireCustomer(req);
    const id = req.nextUrl.searchParams.get("quote_id") ?? "";
    const quote = await getOwnedQuote(id, viewer.userId);
    return NextResponse.json({ pay_url: quote.checkout_status === "link_issued" ? quote.checkout_url : null, status: quote.status });
  });
}
