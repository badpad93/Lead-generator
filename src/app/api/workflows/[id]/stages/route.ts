import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canOperationallyEditWorkflow, getWorkflowActor } from "@/lib/workflows/permissions";

/**
 * POST /api/workflows/[id]/stages
 *
 * Add a new stage to an existing workflow. Only staff who can
 * operationally edit the workflow (assigned rep or elevated role) can
 * add stages — same gate as renaming a stage.
 *
 * Body:
 *   stage_name (required)
 *   stage_type (optional, default 'milestone')
 *   stage_key  (optional — auto-generated from name + timestamp when
 *              omitted so admins don't have to think about uniqueness)
 *   customer_visible (default true)
 *   required_for_completion (default false)
 *   stage_order (optional — appended to the end when omitted)
 *   customer_message (optional)
 *
 * Returns { stage } on success.
 */
const createStageSchema = z.object({
  stage_name: z.string().min(1).max(120),
  stage_type: z
    .enum(["quantity", "status", "date", "approval", "document", "milestone"])
    .default("milestone"),
  stage_key: z.string().min(1).max(60).optional(),
  customer_visible: z.boolean().default(true),
  required_for_completion: z.boolean().default(false),
  stage_order: z.number().int().min(0).optional(),
  customer_message: z.string().max(500).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getWorkflowActor(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: workflow } = await supabaseAdmin
    .from("workflows")
    .select("id, customer_id, assigned_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });

  if (!(await canOperationallyEditWorkflow(actor, workflow))) {
    return NextResponse.json(
      { error: "Forbidden — you must be assigned to edit this workflow" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createStageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Auto-append at the end when the caller doesn't pass an explicit
  // order — keeps admin flow simple ("just click add").
  let stageOrder = input.stage_order;
  if (stageOrder === undefined) {
    const { data: maxRow } = await supabaseAdmin
      .from("workflow_stages")
      .select("stage_order")
      .eq("workflow_id", id)
      .order("stage_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    stageOrder = ((maxRow?.stage_order ?? 0) + 10);
  }

  // Auto-generate stage_key from name + short random suffix when the
  // caller doesn't provide one. Uniqueness within a workflow matters
  // because the PATCH/DELETE endpoints look stages up by key.
  const suggestedKey =
    input.stage_key?.trim() ||
    input.stage_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "stage";
  const stageKey = `${suggestedKey}_${Math.random().toString(36).slice(2, 7)}`;

  const { data: inserted, error } = await supabaseAdmin
    .from("workflow_stages")
    .insert({
      workflow_id: id,
      stage_key: stageKey,
      stage_name: input.stage_name.trim(),
      stage_order: stageOrder,
      stage_type: input.stage_type,
      status: "not_started",
      target_quantity: input.stage_type === "quantity" ? 1 : null,
      completed_quantity: 0,
      customer_visible: input.customer_visible,
      required_for_completion: input.required_for_completion,
      customer_message: input.customer_message ?? null,
      updated_by: actor.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort audit trail — same shape the service layer writes so
  // detail-page History picks it up.
  try {
    await supabaseAdmin.from("workflow_events").insert({
      workflow_id: id,
      event_type: "stage_added",
      new_value: { stage_key: stageKey, stage_name: input.stage_name.trim() },
      actor_user_id: actor.id,
      actor_type: "staff",
      source: "api",
    });
  } catch {
    // Non-fatal — the stage row is what matters.
  }

  return NextResponse.json({ stage: inserted }, { status: 201 });
}
