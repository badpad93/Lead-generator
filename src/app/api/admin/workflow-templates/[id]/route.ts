import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * PATCH  /api/admin/workflow-templates/[id]  — edit a custom template
 * DELETE /api/admin/workflow-templates/[id]  — delete a custom template
 *
 * Both refuse to touch built-in (is_custom=false) templates. Stage
 * edits fully replace the existing stage list (simpler than diffing;
 * safe because in-flight workflows carry their own copy of stages).
 */

const stageSchema = z.object({
  stage_key: z.string().min(1).max(60),
  stage_name: z.string().min(1).max(120),
  stage_order: z.number().int().min(0),
  stage_type: z.enum(["quantity", "status", "date", "approval", "document", "milestone"]),
  required_for_completion: z.boolean().default(false),
  customer_visible: z.boolean().default(true),
  default_customer_message: z.string().max(500).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  default_deadline_days: z.number().int().min(0).max(3650).nullable().optional(),
  quantity_based: z.boolean().optional(),
  completion_rule: z
    .enum([
      "all_required_stages_completed",
      "quantity_reached_on_final_stages",
      "terminal_status",
      "never_auto_completes",
    ])
    .optional(),
  workload_weight: z.number().int().min(1).max(20).optional(),
  category: z.string().max(80).nullable().optional(),
  requires_payment: z.boolean().optional(),
  active: z.boolean().optional(),
  stages: z.array(stageSchema).min(1).max(30).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from("workflow_templates")
    .select("id, is_custom")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!existing.is_custom) {
    return NextResponse.json({ error: "Cannot edit built-in templates" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const { stages, ...templateFields } = parsed.data;
  const templateUpdate: Record<string, unknown> = { ...templateFields };
  Object.keys(templateUpdate).forEach((k) => templateUpdate[k] === undefined && delete templateUpdate[k]);

  if (Object.keys(templateUpdate).length > 0) {
    const { error } = await supabaseAdmin
      .from("workflow_templates")
      .update(templateUpdate)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (stages) {
    // Replace-all — safe because in-flight workflows carry their own
    // stage rows copied at spawn time. Editing the template affects
    // only future spawns.
    await supabaseAdmin.from("workflow_template_stages").delete().eq("template_id", id);
    const rows = stages.map((s) => ({
      template_id: id,
      stage_key: s.stage_key,
      stage_name: s.stage_name,
      stage_order: s.stage_order,
      stage_type: s.stage_type,
      required_for_completion: s.required_for_completion,
      customer_visible: s.customer_visible,
      default_customer_message: s.default_customer_message ?? null,
      description: s.description ?? null,
    }));
    const { error: sErr } = await supabaseAdmin.from("workflow_template_stages").insert(rows);
    if (sErr) return NextResponse.json({ error: `Stage replace failed: ${sErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: existing } = await supabaseAdmin
    .from("workflow_templates")
    .select("id, is_custom")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!existing.is_custom) {
    return NextResponse.json({ error: "Cannot delete built-in templates" }, { status: 403 });
  }

  // Refuse if any workflows reference this template — protects live
  // data. Admin can archive by setting active=false instead.
  const { count } = await supabaseAdmin
    .from("workflows")
    .select("id", { count: "exact", head: true })
    .eq("template_id", id);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `${count} live workflows still use this template. Deactivate it instead of deleting.` },
      { status: 409 },
    );
  }

  await supabaseAdmin.from("workflow_template_stages").delete().eq("template_id", id);
  const { error } = await supabaseAdmin.from("workflow_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
