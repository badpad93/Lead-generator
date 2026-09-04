import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, type SalesUser } from "@/lib/salesAuth";
import { upsertAgreementForOrder } from "@/lib/agreements/sync";
import { resyncOrderTotals } from "@/lib/pricing/orderSync";
import { POST as sendAgreementEmail } from "@/app/api/sales/agreements/[id]/send/route";
import { POST as sendOrderDocument } from "@/app/api/sales/orders/[id]/send/route";

/**
 * POST /api/sales/orders/[id]/process
 *
 * The whole back half of the sale, behind one button.
 *
 * The rep adds line items and sends the quote. When the customer
 * accepts, this route does everything else in a single call:
 *
 *   1. re-sync the order header to its line items
 *   2. flip the quote to an order
 *   3. generate the agreement, tailored to those line items
 *   4. email the agreement for signature
 *   5. create and send the invoice
 *   6. park the order in "waiting on customer payment"
 *
 * Replaces a four-click sequence (Convert to Order -> Generate
 * Agreement -> Send Agreement -> Send Invoice) in which every click was
 * another chance to stop halfway and leave an order that looked
 * finished but had no contract behind it.
 *
 * Idempotent. Every step re-runs safely, so a retry after a failed
 * email resumes instead of duplicating a contract or an invoice.
 */

interface StepResult {
  step: string;
  ok: boolean;
  detail?: string;
}

interface SendOutcome {
  ok: boolean;
  detail?: string;
}

type OrderRow = {
  id: string;
  order_number: string | null;
  document_type: string | null;
  order_status: string | null;
  invoice_status: string | null;
  agreement_status: string | null;
  order_items?: Array<{ id: string }>;
};

const TERMINAL = new Set(["paid", "completed", "cancelled"]);
const AGREEMENT_ALREADY_OUT = new Set(["sent", "viewed", "signed"]);
const INVOICE_ALREADY_OUT = new Set(["sent", "paid"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: order, error } = await supabaseAdmin
    .from("sales_orders")
    .select(
      "id, order_number, document_type, order_status, invoice_status, agreement_status, order_items(id)",
    )
    .eq("id", id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const blocked = guard(order as OrderRow);
  if (blocked) return blocked;

  return runFlow(req, id, user, order as OrderRow);
}

/** Reasons this order can't be processed right now. */
function guard(order: OrderRow): NextResponse | null {
  const items = order.order_items ?? [];
  if (items.length === 0) {
    return NextResponse.json(
      {
        error: "Add at least one line item before processing the order.",
        code: "NO_LINE_ITEMS",
      },
      { status: 400 },
    );
  }
  if (TERMINAL.has(String(order.order_status))) {
    return NextResponse.json(
      { error: `This order is already ${order.order_status}.`, code: "ALREADY_PROCESSED" },
      { status: 409 },
    );
  }
  return null;
}

async function runFlow(
  req: NextRequest,
  id: string,
  user: SalesUser,
  order: OrderRow,
): Promise<NextResponse> {
  const steps: StepResult[] = [];

  // 1 — the header must agree with the lines before anything goes out.
  await resyncOrderTotals(id);
  steps.push({ step: "totals", ok: true });

  // 2 — quote becomes an order.
  await convertToOrder(id, user, order);
  steps.push({ step: "convert_to_order", ok: true });

  // 3 — agreement, built from the line items.
  const agreementResult = await upsertAgreementForOrder(id, user.id);
  if (!agreementResult.ok) {
    return fail(agreementResult.reason, "AGREEMENT_FAILED", steps, 400);
  }
  const agreement = agreementResult.agreement as { id: string; agreement_status?: string };
  steps.push({ step: "generate_agreement", ok: true, detail: agreement.id });

  // 4 — email it for signature.
  const agreementSend = await ensureAgreementSent(req, agreement);
  steps.push({ step: "send_agreement", ok: agreementSend.ok, detail: agreementSend.detail });
  if (!agreementSend.ok) {
    return fail(
      `The order was created but the agreement could not be emailed: ${agreementSend.detail}`,
      "AGREEMENT_SEND_FAILED",
      steps,
      502,
    );
  }

  // 5 — invoice.
  const invoiceSend = await ensureInvoiceSent(req, id, order);
  steps.push({ step: "send_invoice", ok: invoiceSend.ok, detail: invoiceSend.detail });
  if (!invoiceSend.ok) {
    return fail(
      `The agreement went out but the invoice could not be sent: ${invoiceSend.detail}`,
      "INVOICE_SEND_FAILED",
      steps,
      502,
    );
  }

  // 6 — park it.
  return finalize(id, user, agreement.id, steps);
}

function fail(
  message: string | undefined,
  code: string,
  steps: StepResult[],
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: message ?? "Processing failed", code, steps },
    { status },
  );
}

async function convertToOrder(
  id: string,
  user: SalesUser,
  order: OrderRow,
): Promise<void> {
  if (order.document_type === "order") return;

  await supabaseAdmin
    .from("sales_orders")
    .update({ document_type: "order", updated_at: new Date().toISOString() })
    .eq("id", id);

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "quote_converted_to_order",
    description: `Quote ${order.order_number ?? id.slice(0, 8)} converted to order`,
  });
}

async function ensureAgreementSent(
  req: NextRequest,
  agreement: { id: string; agreement_status?: string },
): Promise<SendOutcome> {
  if (AGREEMENT_ALREADY_OUT.has(String(agreement.agreement_status))) {
    return { ok: true, detail: "already sent" };
  }
  return callRoute(req, sendAgreementEmail, agreement.id, { target: "operator" });
}

async function ensureInvoiceSent(
  req: NextRequest,
  id: string,
  order: OrderRow,
): Promise<SendOutcome> {
  if (INVOICE_ALREADY_OUT.has(String(order.invoice_status))) {
    return { ok: true, detail: "already sent" };
  }
  return callRoute(req, sendOrderDocument, id);
}

async function finalize(
  id: string,
  user: SalesUser,
  agreementId: string,
  steps: StepResult[],
): Promise<NextResponse> {
  const { data, error } = await supabaseAdmin
    .from("sales_orders")
    .update({
      order_status: "awaiting_payment",
      invoice_status: "sent",
      agreement_status: "sent",
      next_required_action: "Waiting on customer payment",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, steps }, { status: 500 });
  }

  await supabaseAdmin.from("order_activity_log").insert({
    order_id: id,
    user_id: user.id,
    activity_type: "order_processed",
    description:
      "Order processed — agreement sent for signature and invoice sent. Waiting on customer payment.",
  });

  return NextResponse.json({ ok: true, order: data, agreement_id: agreementId, steps });
}

/* ------------------------------------------------------------------ */

type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

function forwardedRequest(req: NextRequest, body: unknown): NextRequest {
  const headers = new Headers();
  const auth = req.headers.get("authorization");
  const cookie = req.headers.get("cookie");
  if (auth) headers.set("authorization", auth);
  if (cookie) headers.set("cookie", cookie);
  headers.set("content-type", "application/json");

  return new NextRequest(new URL(req.url), {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

/**
 * Invoke another API route in-process, carrying this request's
 * credentials. Reusing the real handlers keeps one implementation of
 * "send an agreement" and "send an invoice" rather than a second copy
 * that drifts from the first.
 */
async function callRoute(
  req: NextRequest,
  handler: RouteHandler,
  id: string,
  body?: unknown,
): Promise<SendOutcome> {
  try {
    const res = await handler(forwardedRequest(req, body), {
      params: Promise.resolve({ id }),
    });
    if (res.ok) return { ok: true };

    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, detail: payload.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
