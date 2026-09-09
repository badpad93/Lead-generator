import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readinessFor } from "@/lib/commerce/checkout";
import { financingReturnUrl } from "@/lib/commerce/financingLink";
import { checkoutAccessFor, quoteRoute, readJson, requireCustomer, requireWriteTools } from "@/lib/commerce/quoteHttp";
import { sendQuoteEmail } from "@/lib/commerce/quoteEmail";
import { getOwnedQuote, listLines, revalidateQuote, type QuoteViewer } from "@/lib/commerce/quotes";
import { QuoteError, type QuoteRow } from "@/lib/commerce/quoteTypes";
import { toQuoteView } from "@/lib/commerce/quoteView";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ quote_id: z.string().uuid() }).strict();
const EMAILABLE = new Set(["confirmed", "invoiced"]);

async function recipientFor(userId: string): Promise<string> {
  const { data: profile } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = typeof profile?.email === "string" && profile.email.includes("@") ? profile.email : null;
  if (!email) throw new QuoteError("invalid_operation", "Add an email address to your profile before emailing a quote.");
  return email;
}

/** Fresh view of an emailable quote: confirmed quotes are repriced first; an expiry during repricing refuses. */
async function emailableBundle(quote: QuoteRow, viewer: QuoteViewer) {
  if (!EMAILABLE.has(quote.status)) throw new QuoteError("invalid_operation", "Confirm the quote before emailing it.", { status: quote.status });
  const bundle = quote.status === "confirmed" ? await revalidateQuote(quote, viewer) : { quote, lines: await listLines(quote.id), changes: [] };
  if (bundle.quote.status !== quote.status) throw new QuoteError("quote_expired", "This quote has expired. Confirm a fresh quote before emailing it.");
  return bundle;
}

/**
 * POST /api/assistant/quote/email — emails the signed-in customer's own
 * confirmed (or invoiced) quote to the email on their profile. The
 * recipient is never taken from the request body. Vinnie cannot call
 * this; only the drawer button does.
 */
export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    await requireWriteTools();
    const { viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => bodySchema.parse(v));
    const quote = await getOwnedQuote(body.quote_id, viewer.userId);
    const [to, bundle] = await Promise.all([recipientFor(viewer.userId), emailableBundle(quote, viewer)]);
    const readiness = await readinessFor(bundle.quote, viewer, await checkoutAccessFor(viewer.userId));
    const view = toQuoteView(bundle.quote, bundle.lines, bundle.changes, readiness);
    await sendQuoteEmail({
      to,
      view,
      payUrl: bundle.quote.checkout_status === "link_issued" ? bundle.quote.checkout_url : null,
      financingUrl: bundle.quote.financing_status === "none" ? null : financingReturnUrl(bundle.quote.id),
    });
    return NextResponse.json({ sent_to: to, quote: view });
  });
}
