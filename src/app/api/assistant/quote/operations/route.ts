import { NextRequest, NextResponse } from "next/server";
import { updateQuoteInput } from "@/lib/assistant/tools/schemas";
import { readinessFor } from "@/lib/commerce/checkout";
import { checkoutAccessFor, quoteRoute, readJson, requireCustomer, requireWriteTools } from "@/lib/commerce/quoteHttp";
import { getOrCreateDraft, rebuildQuote } from "@/lib/commerce/quotes";
import { toQuoteView } from "@/lib/commerce/quoteView";

export const dynamic = "force-dynamic";

/**
 * POST /api/assistant/quote/operations — the drawer's add/remove/quantity
 * path. Same strict schema as the update_quote tool: refs, ops, and
 * quantities only. Requires assistant.write_tools_enabled.
 */
export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    await requireWriteTools();
    const { actor, viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => updateQuoteInput.parse(v));
    const draft = await getOrCreateDraft(viewer, null);
    const bundle = await rebuildQuote(draft, body.operations, viewer);
    const readiness = await readinessFor(bundle.quote, viewer, await checkoutAccessFor(viewer.userId));
    void actor;
    return NextResponse.json({ quote: toQuoteView(bundle.quote, bundle.lines, bundle.changes, readiness) });
  });
}
