/**
 * Agreement <-> order synchronisation.
 *
 * One builder for each direction, so the two directions can't disagree:
 *
 *   order     -> agreement   upsertAgreementForOrder()
 *   agreement -> order       buildOrderItemsFromAgreement()
 *
 * Before this module the order->agreement direction lived in the
 * agreement route and the agreement->order direction was implemented
 * TWICE (agreements/[id]/create-order/route.ts and
 * generateAgreementPdf.autoCreateOrderAndSendInvoice), both rebuilding
 * line items from five scalar columns with discount_percent hardcoded
 * to 0. Round-tripping an order through an agreement deleted every
 * coffee, cooler and financing line and flattened every discount.
 *
 * Both directions now go through line_items_snapshot, which holds every
 * line verbatim. The scalar columns on purchase_agreements are written
 * as a derived cache for legacy readers, never read back as input.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  agreementTotals,
  buildLineItemsSnapshot,
  deriveAgreementSections,
  type AgreementSections,
  type AgreementTotals,
  type LineItemLike,
  type SnapshotLine,
} from "@/lib/pricing/lineItems";

/** Statuses where the customer has already seen the document, so its
 *  contents must not change underneath them. */
const FROZEN_STATUSES = new Set([
  "sent",
  "viewed",
  "signed",
  "countersigned",
  "executed",
]);

export interface UpsertAgreementResult {
  ok: boolean;
  agreement?: Record<string, unknown>;
  reason?: string;
  created?: boolean;
}

type Row = Record<string, unknown>;

/** First non-empty string among the candidates. Keeps the payload
 *  builder free of long `a || b || ""` chains. */
function text(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate;
  }
  return "";
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function logAgreementActivity(
  agreementId: string,
  userId: string,
  activityType: string,
  description: string,
): Promise<void> {
  try {
    await supabaseAdmin.from("agreement_activity_log").insert({
      agreement_id: agreementId,
      user_id: userId,
      activity_type: activityType,
      description,
    });
  } catch (e) {
    console.error("[agreements/sync] activity log failed (non-fatal):", e);
  }
}

/* ------------------------------------------------------------------ */
/*  order -> agreement                                                */
/* ------------------------------------------------------------------ */

async function captureCoffeeSupplyTemplate(): Promise<Row | null> {
  const { data: tpl } = await supabaseAdmin
    .from("agreement_templates")
    .select("id, agreement_type, version, title, content_html, content_hash, effective_date")
    .eq("agreement_type", "coffee_supply")
    .eq("is_active", true)
    .maybeSingle();

  if (!tpl) {
    console.warn(
      "[agreements/sync] coffee line on order but no active coffee_supply template — supply snapshot will be null",
    );
    return null;
  }

  return {
    template_id: tpl.id,
    agreement_type: tpl.agreement_type,
    version: tpl.version,
    title: tpl.title,
    content_html: tpl.content_html,
    content_hash: tpl.content_hash,
    effective_date: tpl.effective_date,
    captured_at: new Date().toISOString(),
  };
}

interface PayloadInput {
  orderId: string;
  order: Row;
  account: Row | null;
  rep: { full_name?: string | null; email?: string | null } | null;
  snapshot: SnapshotLine[];
  totals: AgreementTotals;
  sections: AgreementSections;
  coffeeSupplySnapshot: Row | null;
}

/** Operator identity, taken from the account with the order as
 *  fallback. Split out so the payload builder stays flat. */
function operatorFields(account: Row | null, order: Row): Row {
  const a = account ?? {};
  return {
    operator_company_name: text(a.business_name),
    operator_legal_name: text(a.contact_name),
    operator_email: text(a.email, order.recipient_email),
    operator_phone: text(a.phone),
    operator_billing_address: text(a.address),
    operator_delivery_address: text(a.shipping_address, a.address),
  };
}

/** The scalar columns, kept in step with the snapshot for legacy
 *  readers. Nothing reads them back as input. */
function derivedScalars(totals: AgreementTotals): Row {
  return {
    machine_model: totals.machineModel,
    machine_quantity: totals.machineQuantity,
    machine_unit_price: totals.machineUnitPrice,
    equipment_subtotal: totals.equipmentSubtotal,
    locations_purchased: totals.locationsPurchased,
    location_fee_per_secured: totals.locationFeePerSecured,
    max_location_service_value: totals.maxLocationServiceValue,
    freight_per_machine: totals.freightPerMachine,
    freight_total: totals.freightTotal,
    standard_freight_rate: totals.freightPerMachine,
    discounted_freight_rate: totals.freightPerMachine,
    // Storage is not a line item anywhere in the quote/order flow, so
    // the contract must not charge one.
    storage_fee_per_machine_month: 0,
    total_due_prior_to_procurement: totals.totalDuePriorToProcurement,
  };
}

function buildAgreementPayload(input: PayloadInput): Row {
  const { order, account, snapshot, totals, sections } = input;
  const rep = input.rep ?? {};

  const payload: Row = {
    order_id: input.orderId,
    account_id: order.account_id ?? null,
    agreement_type: "machine_purchase",

    ...operatorFields(account, order),

    apex_representative_name: text(rep.full_name),
    apex_representative_email: text(rep.email),

    // Which schedules this contract gets, decided by what was sold.
    include_equipment: sections.include_equipment,
    include_location_services: sections.include_location_services,
    include_shipping_storage: sections.include_shipping_storage,
    include_financing: sections.include_financing,

    ...derivedScalars(totals),

    line_items_snapshot: snapshot,
    coffee_supply_required: sections.coffee_supply_required,

    updated_at: new Date().toISOString(),
  };

  if (input.coffeeSupplySnapshot) {
    payload.coffee_supply_snapshot = input.coffeeSupplySnapshot;
  }
  return payload;
}

async function loadOrderForAgreement(orderId: string) {
  const { data, error } = await supabaseAdmin
    .from("sales_orders")
    .select("*, sales_accounts:account_id(*), order_items(*)")
    .eq("id", orderId)
    .single();
  if (error) return null;
  return data;
}

async function findLiveAgreement(orderId: string) {
  const { data } = await supabaseAdmin
    .from("purchase_agreements")
    .select("id, agreement_status")
    .eq("order_id", orderId)
    .neq("agreement_status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function readAgreement(agreementId: string): Promise<Row | undefined> {
  const { data } = await supabaseAdmin
    .from("purchase_agreements")
    .select("*")
    .eq("id", agreementId)
    .single();
  return data ?? undefined;
}

function summarise(snapshot: SnapshotLine[], totals: AgreementTotals): string {
  return `${plural(snapshot.length, "line item")}, total ${money(totals.totalDuePriorToProcurement)}`;
}

/**
 * Create — or refresh — the purchase agreement for an order.
 *
 * Idempotent by design: an order has at most one live agreement. If a
 * draft agreement already exists it is updated in place, so pressing
 * the flow button twice can't leave two contracts pointing at one
 * order. An agreement that has already gone out is frozen and returned
 * untouched — the customer has seen it.
 */
export async function upsertAgreementForOrder(
  orderId: string,
  userId: string,
): Promise<UpsertAgreementResult> {
  const order = await loadOrderForAgreement(orderId);
  if (!order) return { ok: false, reason: "Order not found" };

  const items: LineItemLike[] = (order.order_items as LineItemLike[]) ?? [];
  if (items.length === 0) {
    return {
      ok: false,
      reason: "Add at least one line item before generating the agreement",
    };
  }

  const snapshot = buildLineItemsSnapshot(items);
  const totals = agreementTotals(snapshot);
  const sections = deriveAgreementSections(snapshot);

  const { data: rep } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", order.assigned_rep_id ?? order.created_by)
    .maybeSingle();

  const coffeeSupplySnapshot = sections.coffee_supply_required
    ? await captureCoffeeSupplyTemplate()
    : null;

  const payload = buildAgreementPayload({
    orderId,
    order: order as Row,
    account: (order.sales_accounts as Row) ?? null,
    rep,
    snapshot,
    totals,
    sections,
    coffeeSupplySnapshot,
  });

  const summary = summarise(snapshot, totals);
  const existing = await findLiveAgreement(orderId);
  if (existing) {
    return updateExistingAgreement({ existing, payload, userId, summary });
  }
  return insertNewAgreement({ payload, userId, summary });
}

interface UpdateArgs {
  existing: { id: string; agreement_status: string | null };
  payload: Row;
  userId: string;
  summary: string;
}

async function updateExistingAgreement(
  args: UpdateArgs,
): Promise<UpsertAgreementResult> {
  const { existing, payload, userId, summary } = args;
  if (FROZEN_STATUSES.has(String(existing.agreement_status))) {
    return { ok: true, agreement: await readAgreement(existing.id), created: false };
  }

  const { data, error } = await supabaseAdmin
    .from("purchase_agreements")
    .update(payload)
    .eq("id", existing.id)
    .select("*")
    .single();

  if (error) return { ok: false, reason: error.message };

  await logAgreementActivity(
    existing.id,
    userId,
    "refreshed",
    `Agreement refreshed from order — ${summary}`,
  );
  return { ok: true, agreement: data, created: false };
}

async function insertNewAgreement(
  args: { payload: Row; userId: string; summary: string },
): Promise<UpsertAgreementResult> {
  const { payload, userId, summary } = args;
  const { data, error } = await supabaseAdmin
    .from("purchase_agreements")
    .insert({
      ...payload,
      created_by: userId,
      agreement_status: "draft",
      effective_date: new Date().toISOString().slice(0, 10),
    })
    .select("*")
    .single();

  if (error) return { ok: false, reason: error.message };

  await logAgreementActivity(
    data.id,
    userId,
    "created",
    `Agreement created from order — ${summary}`,
  );
  return { ok: true, agreement: data, created: true };
}

export {
  buildOrderItemsFromAgreement,
  type RebuiltOrderItem,
} from "@/lib/agreements/toOrder";
