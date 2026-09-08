import { readinessFor } from "@/lib/commerce/checkout";
import { checkoutAccessFor } from "@/lib/commerce/checkoutAccess";
import { getCurrentQuote, listLines, revalidateQuote } from "@/lib/commerce/quotes";
import { toQuoteView, type QuoteView } from "@/lib/commerce/quoteView";
import { assertPublicShape } from "../publicShapes";
import type { ToolContext } from "./context";

export type GetQuoteOutput =
  | { status: "guest"; message: string }
  | { status: "empty"; message: string }
  | { status: "quote"; quote: QuoteView };

/**
 * Read-only: the customer's current quote, freshly repriced. Returns no
 * QuickBooks identifiers and no checkout URL.
 */
export async function runGetQuote(ctx: ToolContext): Promise<GetQuoteOutput> {
  if (!ctx.profile) {
    return { status: "guest", message: "Guests can explore prices, but a saved quote needs a signed-in account. Invite the customer to sign in." };
  }
  const viewer = { userId: ctx.profile.id, storefront: ctx.storefront };
  const current = await getCurrentQuote(viewer.userId);
  if (!current) return { status: "empty", message: "The customer has no quote yet." };
  const editable = current.status === "draft" || current.status === "confirmed";
  const bundle = editable ? await revalidateQuote(current, viewer) : { quote: current, lines: await listLines(current.id), changes: [] };
  const readiness = await readinessFor(bundle.quote, viewer, await checkoutAccessFor(viewer.userId));
  return assertPublicShape({ status: "quote", quote: toQuoteView(bundle.quote, bundle.lines, bundle.changes, readiness) });
}
