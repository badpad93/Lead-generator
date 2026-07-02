import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getOperatorUser, forbidden, getOperatorContractIds } from "@/lib/operatorMarketplaceAuth";
import { queuePartnerPayoutForSubmission, queueOperatorInvoiceForSubmission } from "@/lib/marketplaceHandoff";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOperatorUser(req);
  if (!user) return forbidden();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  const note = String(body.note || "").trim();

  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const contractIds = await getOperatorContractIds(user);
  if (contractIds.length === 0) return forbidden();

  // Fetch the raw submission (not the view — need the mutable columns), scoped
  // to contracts this operator sourced.
  const { data: submission } = await supabaseAdmin
    .from("placement_submissions")
    .select("id, contract_id, admin_status, operator_status")
    .eq("id", id)
    .in("contract_id", contractIds)
    .maybeSingle();
  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (submission.admin_status !== "approved") {
    return NextResponse.json({ error: "Submission not yet approved by admin" }, { status: 400 });
  }
  if (submission.operator_status === "accepted" || submission.operator_status === "rejected") {
    return NextResponse.json({ error: "Already decided" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const newStatus = action === "accept" ? "accepted" : "rejected";

  await supabaseAdmin
    .from("placement_submissions")
    .update({
      operator_status: newStatus,
      operator_reviewer_id: user.id,
      operator_reviewed_at: now,
      operator_review_note: note || null,
      updated_at: now,
    })
    .eq("id", id);

  await supabaseAdmin.from("placement_submission_activity").insert({
    submission_id: id,
    actor_id: user.id,
    activity_type: `operator_${action}`,
    description: `Operator ${action}ed submission${note ? `: ${note}` : ""}`,
  });

  // Notify partner of the decision (Phase 2.6).
  const { notifyPartnerOperatorDecided } = await import("@/lib/marketplaceNotifications");
  notifyPartnerOperatorDecided(id, newStatus as "accepted" | "rejected").catch(() => undefined);

  if (action === "accept") {
    // Lock a slot on the contract — fulfilled if this fills the last one.
    const { data: contract } = await supabaseAdmin
      .from("placement_contracts")
      .select("id, locations_needed, locations_filled, status")
      .eq("id", submission.contract_id)
      .maybeSingle();

    if (contract) {
      const nextFilled = (contract.locations_filled || 0) + 1;
      const nextStatus = nextFilled >= contract.locations_needed ? "fulfilled" : contract.status;
      await supabaseAdmin
        .from("placement_contracts")
        .update({ locations_filled: nextFilled, status: nextStatus, updated_at: now })
        .eq("id", contract.id);

      await supabaseAdmin.from("placement_contract_activity").insert({
        contract_id: contract.id,
        actor_id: user.id,
        activity_type: "operator_accepted_submission",
        description: `Operator accepted a submission — ${nextFilled}/${contract.locations_needed} filled${nextStatus === "fulfilled" ? " (contract now fulfilled)" : ""}`,
      });
    }

    // Queue payout + invoice, then best-effort push both to QuickBooks in the
    // background. Any failures are surfaced on /admin/marketplace/payouts and
    // can be retried there. Non-critical — decision is already recorded.
    try {
      await queuePartnerPayoutForSubmission({ submissionId: id, triggeredBy: user.id });
      await queueOperatorInvoiceForSubmission({ submissionId: id, triggeredBy: user.id });

      const { data: newPayout } = await supabaseAdmin
        .from("marketplace_payouts")
        .select("id")
        .eq("submission_id", id)
        .maybeSingle();
      const { data: newInvoice } = await supabaseAdmin
        .from("marketplace_operator_invoices")
        .select("id")
        .eq("submission_id", id)
        .maybeSingle();

      const { pushPayoutToQb, pushOperatorInvoiceToQb } = await import("@/lib/marketplaceQb");
      if (newPayout) pushPayoutToQb(newPayout.id).catch(() => undefined);
      if (newInvoice) pushOperatorInvoiceToQb(newInvoice.id).catch(() => undefined);
    } catch {
      // Non-critical — decision already recorded
    }
  }

  return NextResponse.json({ ok: true });
}
