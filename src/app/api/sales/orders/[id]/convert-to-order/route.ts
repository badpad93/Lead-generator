import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

/**
 * POST /api/sales/orders/[id]/convert-to-order
 *
 * Flip a quote to an order. Quotes and orders share the same
 * sales_orders table (differentiated by document_type), so
 * "converting" is:
 *   - document_type: 'quote' → 'order'
 *   - order_status:  reset to 'draft' if the quote was in a
 *     terminal quote state ('quote_sent'), else leave alone
 *   - activity_log entry so the transition shows up on the
 *     order's history
 *
 * Line items, totals, account link, attribution — all preserved
 * because they're on the same row. This is the sanctioned
 * quote-to-order path called from the single Next Step button on
 * the order detail page (deriveNextStep().verb === 'convert_to_order').
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  // Confirm the row is actually a quote before flipping.
  const { data: current, error: fetchErr } = await supabaseAdmin
    .from("sales_orders")
    .select("id, document_type, order_status, order_number")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !current) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  const row = current as { document_type: string | null; order_status: string | null; order_number: string | null };
  if (row.document_type !== "quote") {
    return NextResponse.json(
      { error: "Only quotes can be converted", code: "NOT_A_QUOTE" },
      { status: 409 },
    );
  }

  // If the quote was already sent, drop back to 'draft' so the
  // linear next-step flow points at "Send Invoice." If it's
  // still in draft or awaiting_customer_info, leave it — the
  // next-step derivation will pick the right button off the new
  // document_type alone.
  const newStatus = row.order_status === "quote_sent" ? "draft" : row.order_status;

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("sales_orders")
    .update({
      document_type: "order",
      order_status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "quote_converted_to_order",
    description: `Quote ${row.order_number ?? id.slice(0, 8)} converted to order`,
  });

  return NextResponse.json({ ok: true, order: updated });
}
