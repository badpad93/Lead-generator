import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { assertPublicShape, type OrderStatusOutput, type PaymentStatus } from "../publicShapes";
import type { ToolContext } from "./context";
import type { GetOrderStatusInput } from "./schemas";

/**
 * Order / workflow / quote status for the signed-in customer only.
 *
 * Authorization is a trusted user-id relationship on every source:
 *   coffee_orders.operator_id            = user
 *   workflows.customer_id                = user
 *   storefront_quotes.customer_profile_id = user
 * sales_orders is deliberately NOT consulted: its only customer link is
 * recipient_email, which is not a trusted identity relationship.
 * Unauthorized and nonexistent records both return `not_found`.
 */
type Record_ = NonNullable<OrderStatusOutput["record"]>;
const NOT_FOUND: OrderStatusOutput = { status: "not_found" };
const UUID_RE = /^[0-9a-f-]{36}$/i;

function coffeePayment(status: string | null): PaymentStatus {
  if (status === "awaiting_payment") return "awaiting_payment";
  if (status === "cancelled") return "cancelled";
  if (status === "pending" || status === "processing" || status === "shipped" || status === "delivered") return "paid";
  return "unknown";
}

function workflowPayment(status: string | null): PaymentStatus {
  if (status === "paid") return "paid";
  if (status === "na") return "not_applicable";
  if (status === "unpaid" || status === "partial") return "awaiting_payment";
  return "unknown";
}

interface CoffeeOrderRow {
  id: string;
  order_number: string;
  status: string | null;
  created_at: string;
  total: number | string | null;
  tracking_number: string | null;
}

async function findCoffeeOrder(input: GetOrderStatusInput, userId: string): Promise<Record_ | null> {
  let q = supabaseAdmin
    .from("coffee_orders")
    .select("id, order_number, status, created_at, total, tracking_number")
    .eq("operator_id", userId);
  q = input.order_id ? q.eq("id", input.order_id) : q.eq("order_number", input.order_number);
  const { data } = await q.maybeSingle();
  const row = data as CoffeeOrderRow | null;
  if (!row) return null;
  const { data: lines } = await supabaseAdmin
    .from("coffee_order_items")
    .select("product_name, quantity")
    .eq("order_id", row.id);
  return {
    record_type: "coffee_order",
    reference: row.order_number,
    public_status: String(row.status ?? "unknown").replace(/_/g, " "),
    date: row.created_at,
    items: ((lines ?? []) as Array<{ product_name: string; quantity: number }>).map((l) => ({ name: l.product_name, quantity: Number(l.quantity) })),
    total: row.total === null ? null : Number(row.total),
    tracking_number: row.tracking_number,
    payment_status: coffeePayment(row.status),
    workflow_stage: null,
    stages: [],
    href: `/coffee/orders/${row.id}`,
  };
}

interface WorkflowRow {
  id: string;
  workflow_number: string;
  title: string;
  overall_status: string | null;
  payment_status: string | null;
  created_at: string;
  quantity_purchased: number | null;
  product_name: string | null;
}

async function findWorkflow(input: GetOrderStatusInput, userId: string): Promise<Record_ | null> {
  let q = supabaseAdmin
    .from("workflows")
    .select("id, workflow_number, title, overall_status, payment_status, created_at, quantity_purchased, product_name")
    .eq("customer_id", userId);
  q = input.order_id ? q.eq("id", input.order_id) : q.eq("workflow_number", input.order_number);
  const { data } = await q.maybeSingle();
  const row = data as WorkflowRow | null;
  if (!row) return null;
  const { data: stageRows } = await supabaseAdmin
    .from("workflow_stages")
    .select("stage_name, status, stage_order")
    .eq("workflow_id", row.id)
    .eq("customer_visible", true)
    .order("stage_order", { ascending: true });
  const stages = ((stageRows ?? []) as Array<{ stage_name: string; status: string }>).map((s) => ({ label: s.stage_name, status: s.status }));
  return workflowRecord(row, stages);
}

function currentStage(stages: Array<{ label: string; status: string }>): string | null {
  const active = stages.find((s) => s.status === "in_progress") ?? stages.find((s) => s.status !== "completed" && s.status !== "skipped");
  return active?.label ?? null;
}

function workflowRecord(row: WorkflowRow, stages: Array<{ label: string; status: string }>): Record_ {
  return {
    record_type: "workflow",
    reference: row.workflow_number,
    public_status: String(row.overall_status ?? "unknown").replace(/_/g, " "),
    date: row.created_at,
    items: row.product_name ? [{ name: row.product_name, quantity: Number(row.quantity_purchased ?? 1) }] : [],
    total: null,
    tracking_number: null,
    payment_status: workflowPayment(row.payment_status),
    workflow_stage: currentStage(stages),
    stages,
    href: `/account/workflows/${row.id}`,
  };
}

interface QuoteRow {
  id: string;
  status: string;
  created_at: string;
  total: number | string | null;
  expires_at: string | null;
}

async function findStorefrontQuote(input: GetOrderStatusInput, userId: string): Promise<Record_ | null> {
  if (!input.order_id) return null; // quotes have no public number
  const { data } = await supabaseAdmin
    .from("storefront_quotes")
    .select("id, status, created_at, total, expires_at")
    .eq("customer_profile_id", userId)
    .eq("id", input.order_id)
    .neq("status", "draft")
    .maybeSingle();
  const row = data as QuoteRow | null;
  if (!row) return null;
  const { data: lines } = await supabaseAdmin
    .from("storefront_quote_lines")
    .select("product_name, quantity")
    .eq("quote_id", row.id);
  return {
    record_type: "storefront_quote",
    reference: `Quote ${row.id.slice(0, 8).toUpperCase()}`,
    public_status: row.status,
    date: row.created_at,
    items: ((lines ?? []) as Array<{ product_name: string; quantity: number }>).map((l) => ({ name: l.product_name, quantity: Number(l.quantity) })),
    total: row.total === null ? null : Number(row.total),
    tracking_number: null,
    payment_status: "not_applicable",
    workflow_stage: null,
    stages: [],
    href: null,
  };
}

export async function runGetOrderStatus(input: GetOrderStatusInput, ctx: ToolContext): Promise<OrderStatusOutput> {
  if (!ctx.profile) return assertPublicShape({ status: "authentication_required" });
  if (input.order_id && !UUID_RE.test(input.order_id)) return NOT_FOUND;
  const uid = ctx.profile.id;
  const record =
    (await findCoffeeOrder(input, uid)) ??
    (await findWorkflow(input, uid)) ??
    (await findStorefrontQuote(input, uid));
  if (!record) return NOT_FOUND;
  return assertPublicShape({ status: "found", record });
}
