import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { quoteRoute, readJson, requireCustomer, requireWriteTools } from "@/lib/commerce/quoteHttp";
import { QuoteError } from "@/lib/commerce/quoteTypes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ machine_listing_id: z.string().uuid(), message: z.string().max(2000).nullable(), thread_id: z.string().uuid().nullable() }).strict();

/**
 * POST /api/assistant/listing-inquiry — "Request information" on a
 * marketplace listing. Creates an owner-linked inquiry only; never an
 * order, never a seller price. Requires assistant.write_tools_enabled.
 */
export async function POST(req: NextRequest) {
  return quoteRoute(async () => {
    await requireWriteTools();
    const { viewer } = await requireCustomer(req);
    const body = await readJson(req, (v) => bodySchema.parse(v));
    const { data: listing } = await supabaseAdmin.from("machine_listings").select("id, status, title").eq("id", body.machine_listing_id).eq("status", "active").maybeSingle();
    if (!listing) throw new QuoteError("not_found", "That listing is not available.");
    const { data, error } = await supabaseAdmin
      .from("commerce_listing_inquiries")
      .insert({ user_id: viewer.userId, machine_listing_id: body.machine_listing_id, thread_id: body.thread_id, message: body.message })
      .select("id, status, created_at")
      .single();
    if (error || !data) throw new QuoteError("upstream_error", "The inquiry could not be saved. Please try again.");
    return NextResponse.json({ inquiry: data, listing_title: (listing as { title: string }).title, notice: "Your request was sent. This is not an order and does not lock in a price." });
  });
}
