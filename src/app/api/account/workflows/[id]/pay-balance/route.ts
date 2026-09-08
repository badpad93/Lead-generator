import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { createInvoice, sendInvoiceEmail, getInvoice } from "@/lib/quickbooks";
import { recordEvent } from "@/lib/workflows/service";

/**
 * POST /api/account/workflows/[id]/pay-balance
 *
 * Customer-facing: creates a QuickBooks invoice for the remaining
 * balance (total_due_cents - deposit_paid_cents) on their location
 * services workflow and returns the invoice link so the browser can
 * redirect to the QB hosted payment page.
 *
 * Only fires when there's an actual balance and the workflow is
 * payment_status='partial' or 'unpaid'. Returns 409 otherwise.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (workflow.customer_id !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const totalDue = Number(workflow.total_due_cents ?? 0);
  const paid = Number(workflow.deposit_paid_cents ?? 0);
  const balanceCents = totalDue - paid;
  if (balanceCents <= 0) {
    return NextResponse.json({ error: "No balance to pay" }, { status: 409 });
  }
  if (workflow.payment_status === "paid" || workflow.payment_status === "refunded") {
    return NextResponse.json({ error: `Cannot pay balance from status ${workflow.payment_status}` }, { status: 409 });
  }

  // Look up customer email.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.email) return NextResponse.json({ error: "Customer email missing" }, { status: 400 });

  try {
    const invoice = await createInvoice({
      customerEmail: profile.email,
      customerName: profile.full_name || profile.email,
      customerPhone: profile.phone || undefined,
      lineItems: [
        {
          description: `Location Services — remaining balance (${workflow.workflow_number})`,
          amount: balanceCents / 100,
        },
      ],
      memo: `Balance for workflow ${workflow.workflow_number}`,
      metadata: { type: "workflow_balance", workflow_id: workflow.id },
    });

    await sendInvoiceEmail(invoice.Id, profile.email);
    const full = await getInvoice(invoice.Id);

    // Stash the invoice id on the workflow metadata so we can reconcile
    // on the QB payment webhook.
    await supabaseAdmin
      .from("workflows")
      .update({
        metadata: {
          ...(workflow.metadata ?? {}),
          balance_qb_invoice_id: invoice.Id,
          balance_invoice_sent_at: new Date().toISOString(),
        },
        version: workflow.version + 1,
      })
      .eq("id", workflow.id)
      .eq("version", workflow.version);

    await recordEvent({
      workflowId: workflow.id,
      eventType: "balance_invoice_sent",
      newValue: { qb_invoice_id: invoice.Id, amount_cents: balanceCents },
      actorUserId: userId,
      actorType: "customer",
      source: "pay_balance",
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.Id,
      invoiceLink: full.InvoiceLink ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invoice creation failed";
    console.error("[workflows.pay-balance] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
