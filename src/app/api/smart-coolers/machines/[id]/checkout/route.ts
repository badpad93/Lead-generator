import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";
import {
  deliveryFeeCents,
  HAUL_AWAY_CENTS,
  parseCoffeeItems,
  buildCoffeeLines,
  type InvoiceLine,
  type ResolvedCoffee,
} from "@/lib/smartCoolerCheckout";

/**
 * POST /api/smart-coolers/machines/[id]/checkout
 *
 * Guest checkout for a smart-cooler machine — no account required. Captures
 * the delivery address, a delivery service level (standard $375 / white-glove
 * $500), an optional old-machine haul-away/relocate ($250), and an optional
 * coffee-service add-on (lead details + coffee delivery address + coffee items
 * at guest Tier-1 pricing). Everything is billed on ONE QuickBooks invoice.
 * Coffee prices are re-resolved server-side so the client can't set amounts.
 */
interface Machine {
  id: string;
  name: string;
  price_cents: number | null;
  active: boolean;
}

const trimStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const DELIVERY_FIELDS: Array<[string, string]> = [
  ["delivery_address", "Delivery street address is required"],
  ["delivery_city", "Delivery city is required"],
  ["delivery_state", "Delivery state is required"],
  ["delivery_zip", "Delivery ZIP is required"],
];

function validateContact(body: Record<string, unknown>): NextResponse | null {
  if (!trimStr(body.full_name) || !trimStr(body.email)) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  for (const [field, message] of DELIVERY_FIELDS) {
    if (!trimStr(body[field])) return NextResponse.json({ error: message }, { status: 400 });
  }
  return null;
}

function validate(machine: Machine | null, body: Record<string, unknown>): NextResponse | null {
  if (!machine || !machine.active) {
    return NextResponse.json({ error: "This machine is not available" }, { status: 404 });
  }
  if (!machine.price_cents || machine.price_cents <= 0) {
    return NextResponse.json({ error: "This machine is not available for direct purchase" }, { status: 400 });
  }
  return validateContact(body);
}

interface Totals {
  whiteGlove: boolean;
  haulAway: boolean;
  deliveryCents: number;
  haulCents: number;
  coffeeCents: number;
  totalCents: number;
}

/** Assemble invoice lines (machine + delivery + haul-away + coffee) and totals. */
function assembleLines(machine: Machine, body: Record<string, unknown>, coffee: ResolvedCoffee): { lines: InvoiceLine[]; totals: Totals } {
  const machineCents = machine.price_cents as number;
  const whiteGlove = body.white_glove === true;
  const haulAway = body.haul_away === true;
  const deliveryCents = deliveryFeeCents(whiteGlove);
  const haulCents = haulAway ? HAUL_AWAY_CENTS : 0;

  const lines: InvoiceLine[] = [{ description: machine.name, amount: machineCents / 100 }];
  lines.push({ description: whiteGlove ? "White-glove delivery & install" : "Standard delivery", amount: deliveryCents / 100 });
  if (haulAway) lines.push({ description: "Old machine haul-away / relocation (within 30 mi)", amount: haulCents / 100 });
  lines.push(...coffee.lines);

  const totalCents = machineCents + deliveryCents + haulCents + coffee.totalCents;
  return { lines, totals: { whiteGlove, haulAway, deliveryCents, haulCents, coffeeCents: coffee.totalCents, totalCents } };
}

async function recordPurchase(machine: Machine, userId: string | null, body: Record<string, unknown>, totals: Totals): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("smart_cooler_purchases")
    .insert({
      machine_id: machine.id,
      user_id: userId,
      email: trimStr(body.email),
      full_name: trimStr(body.full_name),
      phone: trimStr(body.phone) || null,
      amount_cents: machine.price_cents,
      delivery_address: trimStr(body.delivery_address),
      delivery_city: trimStr(body.delivery_city),
      delivery_state: trimStr(body.delivery_state),
      delivery_zip: trimStr(body.delivery_zip),
      white_glove: totals.whiteGlove,
      delivery_fee_cents: totals.deliveryCents,
      haul_away: totals.haulAway,
      haul_away_fee_cents: totals.haulCents,
      coffee_requested: body.coffee_requested === true,
      coffee_total_cents: totals.coffeeCents,
      total_cents: totals.totalCents,
      status: "pending",
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

function coffeeContact(body: Record<string, unknown>, c: Record<string, unknown>) {
  return {
    contact_name: trimStr(c.contact_name) || trimStr(body.full_name) || null,
    email: trimStr(c.email) || trimStr(body.email) || null,
    phone: trimStr(c.phone) || trimStr(body.phone) || null,
  };
}

function coffeeAddress(c: Record<string, unknown>) {
  return {
    delivery_address: trimStr(c.delivery_address) || null,
    delivery_city: trimStr(c.delivery_city) || null,
    delivery_state: trimStr(c.delivery_state) || null,
    delivery_zip: trimStr(c.delivery_zip) || null,
  };
}

/** Persist the coffee-service lead (application details + coffee address + items). */
async function recordCoffeeLead(purchaseId: string | null, body: Record<string, unknown>, coffee: ResolvedCoffee): Promise<void> {
  const c = (body.coffee as Record<string, unknown>) || {};
  await supabaseAdmin.from("smart_cooler_coffee_leads").insert({
    purchase_id: purchaseId,
    business_name: trimStr(c.business_name) || null,
    ...coffeeContact(body, c),
    num_locations: trimStr(c.num_locations) || null,
    estimated_volume: trimStr(c.estimated_volume) || null,
    notes: trimStr(c.notes) || null,
    ...coffeeAddress(c),
    items: coffee.items,
    total_cents: coffee.totalCents,
  });
}

async function invoiceAndRespond(machine: Machine, body: Record<string, unknown>, purchaseId: string | null, lines: InvoiceLine[]): Promise<NextResponse> {
  const invoice = await createInvoice({
    customerEmail: trimStr(body.email),
    customerName: trimStr(body.full_name),
    lineItems: lines,
    memo: `Smart cooler purchase — ${machine.name}`,
    metadata: { type: "smart_cooler_purchase", machine_id: machine.id, purchase_id: purchaseId ?? "" },
  });
  if (purchaseId) {
    await supabaseAdmin
      .from("smart_cooler_purchases")
      .update({ qb_invoice_id: invoice.Id, status: "invoiced" })
      .eq("id", purchaseId);
  }
  await sendInvoiceEmail(invoice.Id, trimStr(body.email));
  const full = await getInvoice(invoice.Id);
  if (full.InvoiceLink) return NextResponse.json({ url: full.InvoiceLink });
  return NextResponse.json({ invoiceSent: true, invoiceId: invoice.Id });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: machine } = await supabaseAdmin
    .from("smart_cooler_machines")
    .select("id, name, price_cents, active")
    .eq("id", id)
    .maybeSingle();

  const invalid = validate(machine as Machine | null, body);
  if (invalid) return invalid;
  const m = machine as Machine;

  const coffee = body.coffee_requested === true
    ? await buildCoffeeLines(parseCoffeeItems((body.coffee as Record<string, unknown>)?.items))
    : { lines: [], totalCents: 0, items: [] };

  const { lines, totals } = assembleLines(m, body, coffee);

  // Guest checkout: attach to a signed-in user if present, else record as guest.
  const userId = await getUserIdFromRequest(req);
  const purchaseId = await recordPurchase(m, userId, body, totals);
  if (body.coffee_requested === true) await recordCoffeeLead(purchaseId, body, coffee);

  try {
    return await invoiceAndRespond(m, body, purchaseId, lines);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("[smart-cooler-checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
