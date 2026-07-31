import { NextRequest, NextResponse } from "next/server";
import { getAdminUserId } from "@/lib/adminAuth";
import { getOrCreateWorkflow, updateStage } from "@/lib/workflows/service";
import type { CreateWorkflowInput, WorkflowType } from "@/lib/workflows/types";

/**
 * POST /api/admin/workflows/backfill
 *
 * Admin-only tool for creating a workflow for an existing customer
 * whose purchase/agreement predates this feature. Suppresses initial
 * customer emails and marks the row imported_from_legacy=true.
 *
 * Body:
 *   {
 *     customerId: uuid,
 *     workflowType: WorkflowType,
 *     productName?: string,
 *     quantityPurchased?: number,
 *     completedQuantities?: { stageKey: string, completed: number }[],
 *     startDate?: string (ISO),
 *     dueDate?: string (ISO),
 *     agreementId?: uuid,
 *     orderId?: uuid,
 *     notes?: string,
 *   }
 */
export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  if (!body.customerId || !body.workflowType) {
    return NextResponse.json({ error: "customerId and workflowType are required" }, { status: 400 });
  }

  const legacyId = crypto.randomUUID();

  const input: CreateWorkflowInput = {
    customerId: body.customerId,
    workflowType: body.workflowType as WorkflowType,
    sourceType: "legacy_backfill",
    sourceId: legacyId,
    productName: body.productName,
    quantityPurchased: body.quantityPurchased ?? 1,
    startDate: body.startDate,
    dueDate: body.dueDate,
    agreementId: body.agreementId,
    orderId: body.orderId,
    metadata: { backfilled_by: adminId, notes: body.notes ?? null },
    createdBy: adminId,
    actorType: "staff",
    suppressInitialCustomerEmail: true,
    importedFromLegacy: true,
  };

  try {
    const { workflow, stages, created } = await getOrCreateWorkflow(input);

    // Apply optional stage pre-fills so the imported workflow reflects
    // real-world progress instead of starting from zero.
    if (Array.isArray(body.completedQuantities)) {
      for (const cq of body.completedQuantities as { stageKey: string; completed: number }[]) {
        if (!cq.stageKey || typeof cq.completed !== "number") continue;
        try {
          await updateStage({
            workflowId: workflow.id,
            stageKey: cq.stageKey,
            completedQuantity: cq.completed,
            allowOverTarget: true, // legacy imports may not match target exactly
            updatedBy: adminId,
            actorType: "staff",
            source: "legacy_backfill",
            changeKey: `legacy_backfill:${cq.stageKey}:${legacyId}`,
          });
        } catch (err) {
          console.error("[backfill] stage prefill failed:", err);
        }
      }
    }

    return NextResponse.json({ ok: true, workflow, stagesCount: stages.length, created });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Backfill failed" }, { status: 400 });
  }
}
