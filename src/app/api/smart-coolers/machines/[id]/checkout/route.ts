import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";
import { provisionAccountForGuestCheckout } from "@/lib/auth/provisionalAccount";

/**
 * POST /api/smart-coolers/machines/[id]/checkout
 *
 * Direct purchase of a smart-cooler card (its own price_cents), billed through
 * the same QuickBooks hosted-invoice flow as machine listings. Body:
 * { full_name, email, phone }.
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

/** Signed-in user id, or a provisioned guest account, or an error response. */
async function resolveBuyer(req: NextRequest, body: Record<string, unknown>): Promise<{ userId: string } | { error: NextResponse }> {
  const existing = await getUserIdFromRequest(req);
  if (existing) return { userId: existing };
  try {
    const result = await provisionAccountForGuestCheckout({
      email: body.email as string,
      business_name: (body.full_name as string) || (body.email as string),
      contact_name: (body.full_name as string) || "",
      phone: body.phone as string,
      address: "",
      city: null,
      state: null,
      zip: null,
      marketing_consent: body.marketing_consent !== false,
    });
    if ("existing" in result && result.existing) {
      return { error: NextResponse.json(
        { error: "An account already exists for this email. Please sign in and try again.", requires_sign_in: true },
        { status: 409 },
      ) };
    }
    return { userId: result.userId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create account";
    return { error: NextResponse.json({ error: msg }, { status: 500 }) };
  }
}

async function recordPurchase(machine: Machine, userId: string, body: Record<string, unknown>): Promise<string | null> {
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

  const buyer = await resolveBuyer(req, body);
  if ("error" in buyer) return buyer.error;

  const purchaseId = await recordPurchase(machine as Machine, buyer.userId, body);

  try {
    return await invoiceAndRespond(machine as Machine, body, purchaseId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    console.error("[smart-cooler-checkout] error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
