/**
 * Paid order -> workflows.
 *
 * When a customer's payment lands, the order stops being a sales
 * artefact and becomes work for the team. That handoff used to happen
 * only for `order_type = 'location_services'`; every other paid order —
 * machines, coffee, financing — sat in the CRM with no workflow behind
 * it and no one assigned to it, and the only way to create one was an
 * admin-only "Send to Workflows" button that had to be found and
 * clicked.
 *
 * Now every paid order spawns the workflows its line items call for,
 * automatically, from whichever path recorded the payment (the
 * QuickBooks webhook or a manual mark-paid).
 *
 * Idempotent: an order that already has linked workflows is left alone,
 * and getOrCreateWorkflow dedupes on (source_type, source_id,
 * workflow_type, product_key).
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { categorize, type ItemCategory, type LineItemLike } from "@/lib/pricing/lineItems";
import type { PrimaryTeam, WorkflowType } from "./types";

interface WorkflowPlan {
  workflowType: WorkflowType;
  primaryTeam: PrimaryTeam;
  productKey: string;
  label: string;
}

/** Which workflow each kind of line item belongs to. Categories not
 *  listed here (freight, other) ride along with the equipment or
 *  service they were sold beside and don't spawn work of their own. */
const CATEGORY_PLANS: Partial<Record<ItemCategory, WorkflowPlan>> = {
  equipment: {
    workflowType: "ai_machine_fulfillment",
    primaryTeam: "fulfillment",
    productKey: "machine",
    label: "AI Machine Fulfillment",
  },
  coffee: {
    workflowType: "coffee_equipment",
    primaryTeam: "coffee",
    productKey: "coffee_program",
    label: "Coffee Program Setup",
  },
  location_services: {
    workflowType: "location_services",
    primaryTeam: "locations",
    productKey: "location_services",
    label: "Location Services",
  },
  financing: {
    workflowType: "financing",
    primaryTeam: "financing",
    productKey: "financing",
    label: "Financing",
  },
};

interface OrderContext {
  id: string;
  account_id: string | null;
  recipient_email: string | null;
  assigned_rep_id: string | null;
  created_by: string | null;
  order_number: string | null;
  order_items: LineItemLike[];
}

/** Which workflows this order's line items call for, with the quantity
 *  each one covers. */
export function planWorkflowsForItems(
  items: LineItemLike[],
): Array<WorkflowPlan & { quantity: number }> {
  const quantities = new Map<ItemCategory, number>();

  for (const item of items) {
    const category = categorize(item);
    if (!CATEGORY_PLANS[category]) continue;
    const qty = Number(item.quantity) || 1;
    quantities.set(category, (quantities.get(category) ?? 0) + qty);
  }

  const plans: Array<WorkflowPlan & { quantity: number }> = [];
  for (const [category, quantity] of quantities) {
    const plan = CATEGORY_PLANS[category];
    if (plan) plans.push({ ...plan, quantity });
  }
  return plans;
}

async function loadOrderContext(orderId: string): Promise<OrderContext | null> {
  const { data } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, account_id, recipient_email, assigned_rep_id, created_by, order_number, order_items(*)",
    )
    .eq("id", orderId)
    .maybeSingle();
  return (data as OrderContext | null) ?? null;
}

async function resolveCustomerId(order: OrderContext): Promise<string | null> {
  if (order.recipient_email) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", order.recipient_email.trim())
      .maybeSingle();
    if (data) return data.id as string;
  }
  if (order.account_id) {
    const { data } = await supabaseAdmin
      .from("sales_accounts")
      .select("owner_user_id")
      .eq("id", order.account_id)
      .maybeSingle();
    const owner = (data as { owner_user_id?: string } | null)?.owner_user_id;
    if (owner) return owner;
  }
  return order.assigned_rep_id ?? order.created_by;
}

async function hasLinkedWorkflow(orderId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("workflows")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Spawn every workflow a freshly-paid order calls for. Returns the ids
 * created (or already present). Best-effort: never throws, because the
 * payment it follows has already been recorded.
 */
async function createWorkflow(
  order: OrderContext,
  customerId: string,
  plan: WorkflowPlan & { quantity: number },
): Promise<string> {
  const { getOrCreateWorkflow } = await import("./service");
  const label = `Order #${order.order_number ?? order.id.slice(0, 8)}`;
  const result = await getOrCreateWorkflow({
    customerId,
    companyId: order.account_id,
    workflowType: plan.workflowType,
    sourceType: "sales_order",
    sourceId: order.id,
    orderId: order.id,
    productKey: plan.productKey,
    productName: `${plan.label} — ${label}`,
    quantityPurchased: plan.quantity,
    paymentStatus: "paid",
    primaryTeam: plan.primaryTeam,
    startDate: new Date().toISOString(),
    metadata: {
      source: "sales_order_paid",
      order_id: order.id,
      order_number: order.order_number,
    },
  });
  return result.workflow.id;
}

/**
 * Spawn every workflow a freshly-paid order calls for. Returns the ids
 * created (or already present). Best-effort: never throws, because the
 * payment it follows has already been recorded.
 */
export async function spawnWorkflowsForPaidOrder(orderId: string): Promise<string[]> {
  try {
    return await runSpawn(orderId);
  } catch (e) {
    console.error("[workflows/fromPaidOrder] spawn failed (non-fatal):", e);
    return [];
  }
}

async function runSpawn(orderId: string): Promise<string[]> {
  if (await hasLinkedWorkflow(orderId)) return [];

  const order = await loadOrderContext(orderId);
  if (!order) return [];

  const plans = planWorkflowsForItems(order.order_items ?? []);
  if (plans.length === 0) return [];

  const customerId = await resolveCustomerId(order);
  if (!customerId) {
    console.warn(
      `[workflows/fromPaidOrder] order ${orderId} is paid but has no resolvable customer — no workflow spawned`,
    );
    return [];
  }

  const created: string[] = [];
  for (const plan of plans) {
    created.push(await createWorkflow(order, customerId, plan));
  }
  return created;
}
