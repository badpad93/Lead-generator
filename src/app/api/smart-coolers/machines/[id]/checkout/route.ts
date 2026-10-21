import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";

/**
 * POST /api/smart-coolers/machines/[id]/checkout
 *
 * Direct purchase of a smart-cooler card (its own price_cents). True guest
 * checkout — no account or sign-in required; the buyer just provides name +
 * email and gets a QuickBooks hosted invoice. A signed-in buyer's order is
 * attached to their account; guests are recorded with user_id = null.
 * Body: { full_name, email, phone }.
 */
interface Machine {
  id: string;
  name: string;
  price_cents: number | null;
  active: boolean;
}

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function validate(machine: Machine | null, body: Record<string, unknown>): NextResponse | null {
  if (!machine || !machine.active) {
    return NextResponse.json({ error: "This machine is not available" }, { status: 404 });
  }
  if (!machine.price_cents || machine.price_cents <= 0) {
    return NextResponse.json({ error: "This machine is not available for direct purchase" }, { status: 400 });
  }
  const name = trimStr(body.full_name);
  const email = trimStr(body.email);
  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }
  return null;
}

async function recordPurchase(machine: Machine, userId: string | null, body: Record<string, unknown>): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("smart_cooler_purchases")
    .insert({
      machine_id: machine.id,
      user_id: userId,
      email: (body.email as string).trim(),
      full_name: (body.full_name as string).trim(),
      phone: (body.phone as string) || null,
      amount_cents: machine.price_cents,
      status: "pending",
    })
    .select("id")
    .single();
  return data?.id ?? null;
}

async function invoiceAndRespond(machine: Machine, body: Record<string, unknown>, purchaseId: string | null): Promise<NextResponse> {
  const invoice = await createInvoice({
    customerEmail: body.email as string,
    customerName: body.full_name as string,
    lineItems: [{ description: machine.name, amount: (machine.price_cents as number) / 100 }],
    memo: `Smart cooler purchase — ${machine.name}`,
    metadata: { type: "smart_cooler_purchase", machine_id: machine.id, purchase_id: purchaseId ?? "" },
  });
  if (purchaseId) {
    await supabaseAdmin
      .from("smart_cooler_purchases")
      .update({ qb_invoice_id: invoice.Id, status: "invoiced" })
      .eq("id", purchaseId);
  }
  await sendInvoiceEmail(invoice.Id, body.email as string);
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

  // Guest checkout: no account required. Attach to the signed-in user if there
  // is one; otherwise record the order as a guest (user_id null).
  const userId = await getUserIdFromRequest(req);
  const purchaseId = await recordPurchase(machine as Machine, userId, body);

  try {
    return await invoiceAndRespond(machine as Machine, body, purchaseId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("[smart-cooler-checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
