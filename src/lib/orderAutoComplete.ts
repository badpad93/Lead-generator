import { supabaseAdmin } from "./supabaseAdmin";

/**
 * Auto-flip a paid order to 'completed' status so the CRM stops
 * showing rep-facing next-step buttons for machine ordering,
 * shipping, and delivery. Those states are legacy — fulfillment
 * now lives on the workflow that syncWorkflowFromSalesOrderPaid
 * spawns off the payment event. Once payment lands, the sales side
 * is done; the workflow is the operational vehicle.
 *
 * Callers: QB webhook on primary-invoice paid, and the status
 * route on manual mark_paid.
 *
 * Skips (returns without changing state):
 *   - order not found
 *   - already completed or cancelled
 *   - location_services intake orders — those keep the paid state
 *     alive so the Sourced Locations panel can finish before the
 *     order is marked done. They complete via the invoice-remaining
 *     path when the last placement is invoiced, or manually via
 *     mark_completed once the rep is finished sourcing.
 */
export async function autoCompleteFullyPaidOrder(
  orderId: string,
  source: string,
): Promise<{ completed: boolean; reason?: string }> {
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_status, order_type")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { completed: false, reason: "not_found" };
  if (order.order_status === "completed") return { completed: false, reason: "already_completed" };
  if (order.order_status === "cancelled") return { completed: false, reason: "cancelled" };
  if (order.order_type === "location_services") {
    return { completed: false, reason: "location_services_intake_defers_completion" };
  }

  await supabaseAdmin
    .from("sales_orders")
    .update({
      order_status: "completed",
      fulfillment_status: "completed",
      next_required_action: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: orderId,
    activity_type: "auto_completed_on_payment",
    description: `Order auto-completed on payment — fulfillment handoff to workflow (source: ${source})`,
  });

  return { completed: true };
}
