import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { financingReturnUrl } from "@/lib/commerce/financingLink";
import { quoteRoute, readJson, requireCustomer, requireWriteTools } from "@/lib/commerce/quoteHttp";
import { getOwnedQuote, recordFinancingInterest } from "@/lib/commerce/quotes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ quote_id: z.string().uuid(), program: z.enum(["standard", "ten_ten_ten"]) }).strict();

/**
 * POST /api/assistant/quote/financing-interest — records interest and
 * returns the existing /financing flow URL carrying an opaque quote
 * reference. Nothing is submitted, no financial data is collected, and
 * the quote total does not change.
 */
export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    await requireWriteTools();
    const { viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => bodySchema.parse(v));
    const quote = await getOwnedQuote(body.quote_id, viewer.userId);
    const updated = await recordFinancingInterest(quote, body.program);
    return NextResponse.json({
      financing: { program: updated.financing_program, status: updated.financing_status },
      financing_url: financingReturnUrl(updated.id),
      notice: "Financing interest is recorded. It is not an approval, a rate, a term, or a reduction of the amount due.",
    });
  });
}
