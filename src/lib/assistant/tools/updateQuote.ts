import { readinessFor } from "@/lib/commerce/checkout";
import { checkoutAccessFor } from "@/lib/commerce/checkoutAccess";
import { getOrCreateDraft, rebuildQuote } from "@/lib/commerce/quotes";
import { QuoteError } from "@/lib/commerce/quoteTypes";
import { toQuoteView, type QuoteView } from "@/lib/commerce/quoteView";
import { assertPublicShape } from "../publicShapes";
import type { ToolContext } from "./context";
import type { UpdateQuoteInput } from "./schemas";

export interface UpdateQuoteOutput {
  status: "quote";
  quote: QuoteView;
}

/**
 * Mutate the signed-in customer's draft quote with catalog refs and
 * quantities only. Every price and total in the result was computed by
 * the server; the model never supplied one.
 */
export async function runUpdateQuote(input: UpdateQuoteInput, ctx: ToolContext): Promise<UpdateQuoteOutput> {
  if (!ctx.profile) throw new QuoteError("authentication_required", "Sign in to build a saved quote.");
  if (!ctx.writeToolsEnabled) throw new QuoteError("write_tools_disabled", "Saved quotes are not available yet.");
  const viewer = { userId: ctx.profile.id, storefront: ctx.storefront };
  const draft = await getOrCreateDraft(viewer, ctx.threadId);
  const bundle = await rebuildQuote(draft, input.operations, viewer);
  const readiness = await readinessFor(bundle.quote, viewer, await checkoutAccessFor(viewer.userId));
  return assertPublicShape({ status: "quote", quote: toQuoteView(bundle.quote, bundle.lines, bundle.changes, readiness) });
}
