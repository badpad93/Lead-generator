import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { orderTotals, remainingBalance, type LineItemLike } from "@/lib/pricing/lineItems";

/**
 * Recompute an order header from its line items.
 *
 * Every item add / edit / delete used to inline its own version of
 * this, and each one stamped `remaining_balance = newTotal` — wiping
 * out a deposit that had already been paid. `deposit_amount` was only
 * ever computed at order-creation time and never revisited.
 */
export async function resyncOrderTotals(orderId: string): Promise<void> {
  const { data: items } = await supabaseAdmin
    .from("order_items")
    .select(
      "quantity, unit_price, price, discount_percent, total_price, status, deposit_required, location_deposit_amount",
    )
    .eq("order_id", orderId);

  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("deposit_paid")
    .eq("id", orderId)
    .maybeSingle();

  const totals = orderTotals((items || []) as LineItemLike[]);

  await supabaseAdmin
    .from("sales_orders")
    .update({
      total_value: totals.upfrontTotal,
      deposit_amount: totals.depositTotal,
      remaining_balance: remainingBalance(
        totals.upfrontTotal,
        totals.depositTotal,
        order?.deposit_paid,
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
}
