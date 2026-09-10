import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { quoteRoute, requireCustomer } from "@/lib/commerce/quoteHttp";
import { getOwnedQuote } from "@/lib/commerce/quotes";
import { QuoteError } from "@/lib/commerce/quoteTypes";
import { isExportFormat, renderPlanExport } from "@/lib/businessPlan/exports";
import { getOwnedPlan } from "@/lib/businessPlan/store";
import type { SectionContext } from "@/lib/businessPlan/sections";

export const dynamic = "force-dynamic";

/**
 * GET /api/assistant/business-plan/[id]/export?format=xlsx|docx|pdf
 *
 * Server-side generation of the saved plan for its owner only. The plan
 * id must be a UUID, the format must be one of three, the filename is
 * built from the plan number (never from customer input), and the file
 * contains nothing the chat view does not already show.
 */
const idSchema = z.string().uuid();

async function sectionContext(quoteId: string | null, userId: string, financing: SectionContext["financing_status"]): Promise<SectionContext> {
  if (!quoteId) return { quote: null, financing_status: financing };
  try {
    const q = await getOwnedQuote(quoteId, userId);
    return { quote: { quote_number: q.quote_number, subtotal: q.subtotal, line_count: 0, status: q.status }, financing_status: financing };
  } catch {
    return { quote: null, financing_status: financing };
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return quoteRoute(async () => {
    const { viewer } = await requireCustomer(req);
    const { id } = await context.params;
    const parsedId = idSchema.safeParse(id);
    const format = req.nextUrl.searchParams.get("format");
    if (!parsedId.success || !isExportFormat(format)) throw new QuoteError("invalid_operation", "Unknown plan or export format.");
    const plan = await getOwnedPlan(parsedId.data, viewer.userId);
    const rendered = await renderPlanExport(plan, format, await sectionContext(plan.quote_id, viewer.userId, plan.financing_status));
    return new NextResponse(Buffer.from(rendered.bytes), {
      status: 200,
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `attachment; filename="${rendered.filename}"`,
        "Cache-Control": "no-store, private",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
