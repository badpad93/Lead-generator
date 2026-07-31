import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromRequest } from "@/lib/apiAuth";
import { recordCustomerDecision } from "@/lib/workflows/approvals";

/**
 * POST /api/account/workflows/[id]/decisions/[approvalId]
 *
 * Customer decides on a location submission presented for approval.
 *
 * Body:
 *   { decision: "accepted" | "declined", declineReason?: string }
 *
 * The service enforces:
 *   - customer owns the workflow (403 otherwise)
 *   - approval is still pending (409 otherwise)
 *   - decline_budget_used < quantity_purchased when decision=declined
 *     (422 with a clear error message otherwise — no more declines)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; approvalId: string }> },
) {
  const userId = await getUserIdFromRequest(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, approvalId } = await params;
  const body = await req.json().catch(() => ({}));

  const decision = body.decision;
  if (decision !== "accepted" && decision !== "declined") {
    return NextResponse.json(
      { error: "decision must be 'accepted' or 'declined'" },
      { status: 400 },
    );
  }

  const declineReason = typeof body.declineReason === "string" ? body.declineReason.slice(0, 500) : undefined;

  const result = await recordCustomerDecision({
    workflowId: id,
    approvalId,
    decision,
    declineReason,
    actorUserId: userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  return NextResponse.json({ ok: true, approval: result.approval });
}
