import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWorkflowActor, hasPermission } from "@/lib/workflows/permissions";
import { recordEvent, recomputeWorkflowRollup } from "@/lib/workflows/service";

/**
 * PATCH /api/workflows/[id]/payment-status
 *
 * Manual payment-status override. Automatic sync from
 * webhooks/stage-completion continues to run; this is a fallback for
 * when a payment was received off-platform (cash, wire, external Stripe
 * account, etc.) and staff need to flip the workflow without a matching
 * source event.
 *
 * Requires workflows.edit_status (admin, DOS, market_leader).
 */
const bodySchema = z.object({
  payment_status: z.enum(["unpaid", "partial", "paid", "refunded", "na"]),
  reason: z.string().min(1).max(500),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(actor, "workflows.edit_status")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id, payment_status, version, total_due_cents, deposit_paid_cents")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (workflow.payment_status === parsed.data.payment_status) {
    return NextResponse.json({ ok: true, workflow, unchanged: true });
  }

  const patch: Record<string, unknown> = {
    payment_status: parsed.data.payment_status,
    version: (workflow.version ?? 1) + 1,
    updated_by: actor.id,
  };
  // Bumping to 'paid' also zeroes the balance for the UI's Pay Balance
  // section (matches what happens when the QB webhook lands).
  if (
    parsed.data.payment_status === "paid" &&
    workflow.total_due_cents != null &&
    Number(workflow.total_due_cents) > 0
  ) {
    patch.deposit_paid_cents = Number(workflow.total_due_cents);
  }

  const { data: updated, error } = await supabaseAdmin
    .from("workflows")
    .update(patch)
    .eq("id", workflow.id)
    .eq("version", workflow.version)
    .select("*")
    .single();
  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Update failed" }, { status: 409 });
  }

  await recordEvent({
    workflowId: workflow.id,
    eventType: "payment_status_overridden",
    previousValue: { payment_status: workflow.payment_status },
    newValue: { payment_status: parsed.data.payment_status, reason: parsed.data.reason },
    changedFields: ["payment_status"],
    actorUserId: actor.id,
    actorType: "staff",
    source: "manual_override",
    notes: parsed.data.reason,
  });

  // Recompute overall_status so the list view reflects the change
  // immediately (e.g. drops out of 'pending_payment').
  await recomputeWorkflowRollup(workflow.id, actor.id);

  return NextResponse.json({ ok: true, workflow: updated });
}
