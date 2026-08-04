/**
 * Coffee → CRM order mirror.
 *
 * When a coffee_orders row gets paid (webhook fires handleCoffeeOrderCompleted),
 * we synthesize a matching sales_orders row + order_items rows so the CRM
 * order dashboard can surface it and the existing "Send Receipt" flow at
 * /sales/orders/[id] works with zero extra plumbing.
 *
 * Idempotent by coffee_orders.sales_order_id — a re-fired webhook won't
 * duplicate. Safe for backfill of historical paid coffee orders.
 */

import { supabaseAdmin } from "./supabaseAdmin";
import { writeAuditLog } from "./paymentLedger";
import { findOrCreateSalesAccount } from "./salesAccountResolver";

export interface MirrorResult {
  status: "created" | "already_mirrored" | "skipped_not_paid" | "not_found";
  coffeeOrderId: string;
  salesOrderId?: string;
  accountId?: string;
  error?: string;
}

/**
 * Find or create a sales_accounts row for a coffee-order buyer via the
 * shared findOrCreateSalesAccount helper — same normalization used
 * everywhere else, so rep-created accounts and mirror-created accounts
 * dedup on matching email or business_name.
 */
async function ensureAccountForOperator(operatorId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, company_name, email, phone")
    .eq("id", operatorId)
    .maybeSingle();
  if (!profile) return null;

  const businessName = profile.company_name?.trim() || profile.full_name?.trim() || "Coffee Customer";
  try {
    const { id } = await findOrCreateSalesAccount({
      email: profile.email ?? null,
      business_name: businessName,
      contact_name: profile.full_name ?? null,
      phone: profile.phone ?? null,
    });
    return id;
  } catch {
    return null;
  }
}

export async function mirrorCoffeeOrderToCrm(coffeeOrderId: string): Promise<MirrorResult> {
  const { data: coffeeOrder, error } = await supabaseAdmin
    .from("coffee_orders")
    .select("*, coffee_order_items(*)")
    .eq("id", coffeeOrderId)
    .maybeSingle();
  if (error || !coffeeOrder) {
    return { status: "not_found", coffeeOrderId, error: error?.message };
  }

  // Idempotency: already mirrored → done.
  if (coffeeOrder.sales_order_id) {
    return {
      status: "already_mirrored",
      coffeeOrderId,
      salesOrderId: coffeeOrder.sales_order_id,
    };
  }

  // Skip statuses that mean "not paid yet" — mirroring an unpaid order into
  // CRM would create a fake paid record. handleCoffeeOrderCompleted only
  // fires on paid, but backfill needs this guard.
  const paidStatuses = new Set(["pending", "processing", "shipped", "delivered"]);
  if (!paidStatuses.has(coffeeOrder.status)) {
    return { status: "skipped_not_paid", coffeeOrderId };
  }

  const accountId = await ensureAccountForOperator(coffeeOrder.operator_id);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", coffeeOrder.operator_id)
    .maybeSingle();

  const totalValue = Number(coffeeOrder.total || 0);
  const now = new Date().toISOString();

  const noteLines = [
    `Auto-mirrored from coffee order ${coffeeOrder.order_number} on ${new Date().toISOString().slice(0, 10)}.`,
  ];
  if (coffeeOrder.notes?.trim()) noteLines.push(`Customer notes: ${coffeeOrder.notes.trim()}`);
  const shippingLine = [
    coffeeOrder.shipping_name,
    coffeeOrder.shipping_address,
    [coffeeOrder.shipping_city, coffeeOrder.shipping_state, coffeeOrder.shipping_zip].filter(Boolean).join(", "),
  ].filter(Boolean).join(" · ");
  if (shippingLine) noteLines.push(`Ship to: ${shippingLine}`);

  // Create sales_orders row. Every status field is set to "already done" so
  // it lands directly in a completed state — the receipt is the only next
  // action available.
  const { data: salesOrder, error: soErr } = await supabaseAdmin
    .from("sales_orders")
    .insert({
      account_id: accountId,
      created_by: coffeeOrder.operator_id,
      assigned_rep_id: null,
      total_value: totalValue,
      status: "completed",
      order_status: "paid",
      order_type: "coffee",
      document_type: "order",
      payment_status: "paid",
      invoice_status: "sent",
      agreement_status: "not_required",
      fulfillment_status: "in_progress",
      receipt_status: "not_sent",
      recipient_email: profile?.email || null,
      notes: noteLines.join("\n"),
      updated_at: now,
    })
    .select("id")
    .single();
  if (soErr || !salesOrder) {
    return { status: "not_found", coffeeOrderId, error: soErr?.message || "sales_orders insert failed" };
  }

  // Mirror line items
  const items = (coffeeOrder.coffee_order_items || []) as Array<{
    product_name: string;
    product_sku: string | null;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
  if (items.length > 0) {
    const rows = items.map((i) => ({
      order_id: salesOrder.id,
      service_name: i.product_name,
      item_type: "coffee",
      description: i.product_sku || null,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
      total_price: Number(i.line_total),
      price: Number(i.line_total),
      status: "paid",
    }));
    // "price" is the old-column carryover (see migration 009). Newer rows
    // use total_price; migration 082 kept "price" for compatibility. We fill
    // both so old code paths continue to render.
    await supabaseAdmin.from("order_items").insert(rows);
  }

  // Add a shipping line if the coffee estimate is non-zero
  if (Number(coffeeOrder.shipping_estimate || 0) > 0) {
    await supabaseAdmin.from("order_items").insert({
      order_id: salesOrder.id,
      service_name: "Shipping",
      item_type: "shipping",
      description: null,
      quantity: 1,
      unit_price: Number(coffeeOrder.shipping_estimate),
      total_price: Number(coffeeOrder.shipping_estimate),
      price: Number(coffeeOrder.shipping_estimate),
      status: "paid",
    });
  }

  // Link back so retries + future coffee-order edits don't re-mirror
  await supabaseAdmin
    .from("coffee_orders")
    .update({ sales_order_id: salesOrder.id, updated_at: now })
    .eq("id", coffeeOrderId);

  // Audit
  await writeAuditLog({
    actorId: null,
    action: "coffee_order_mirrored_to_crm",
    entityType: "sales_order",
    entityId: salesOrder.id,
    metadata: {
      coffee_order_id: coffeeOrderId,
      coffee_order_number: coffeeOrder.order_number,
      account_id: accountId,
      total: totalValue,
      item_count: items.length,
    },
  });

  return {
    status: "created",
    coffeeOrderId,
    salesOrderId: salesOrder.id,
    accountId: accountId || undefined,
  };
}

export async function mirrorPaidCoffeeOrdersBackfill(opts: { limit?: number; sinceDays?: number }): Promise<{
  scanned: number;
  created: number;
  already: number;
  skipped: number;
  errors: string[];
}> {
  const summary = { scanned: 0, created: 0, already: 0, skipped: 0, errors: [] as string[] };
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const cutoff = new Date(Date.now() - (opts.sinceDays ?? 90) * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabaseAdmin
    .from("coffee_orders")
    .select("id, status, sales_order_id")
    .in("status", ["pending", "processing", "shipped", "delivered"])
    .is("sales_order_id", null)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);

  for (const row of data || []) {
    summary.scanned++;
    try {
      const result = await mirrorCoffeeOrderToCrm(row.id);
      if (result.status === "created") summary.created++;
      else if (result.status === "already_mirrored") summary.already++;
      else summary.skipped++;
      if (result.error) summary.errors.push(`${row.id.slice(0, 8)}: ${result.error}`);
    } catch (e) {
      summary.errors.push(`${row.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return summary;
}
