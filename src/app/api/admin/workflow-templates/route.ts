import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET  /api/admin/workflow-templates
 * POST /api/admin/workflow-templates
 *
 * Admin-only CRUD for workflow_templates + workflow_template_stages.
 * Built-in templates (is_custom=false) can be listed but not created
 * by this endpoint; custom templates get is_custom=true and workflow
 * type auto-prefixed with "custom:".
 */

const stageSchema = z.object({
  stage_key: z.string().max(60).optional(),
  stage_name: z.string().min(1).max(120),
  stage_order: z.number().int().min(0),
  stage_type: z.enum(["quantity", "status", "date", "approval", "document", "milestone"]),
  required_for_completion: z.boolean().default(false),
  customer_visible: z.boolean().default(true),
  default_customer_message: z.string().max(500).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
});

/**
 * Derive a URL-safe, DB-friendly stage_key from the human stage_name.
 * Guarantees: lowercase, only [a-z0-9_], no leading/trailing/duplicate
 * underscores, at most 60 chars. Callers must resolve duplicates
 * against (template_id, stage_key) UNIQUE.
 *
 * Ignoring whatever the admin typed into the stage_key field is
 * deliberate — admins keep pasting the human label into that box
 * because the two inputs are visually similar, which produces
 * stage_keys with spaces + uppercase that then break the URL path
 * on DELETE /api/workflows/[id]/stages/[stageKey].
 */
function slugifyStageKey(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 55);
  return cleaned || "stage";
}

/** Assigns a unique slug per stage using a numeric suffix on collision. */
function assignUniqueKeys<T extends { stage_name: string }>(
  stages: T[],
): Array<T & { stage_key: string }> {
  const used = new Set<string>();
  return stages.map((s) => {
    const base = slugifyStageKey(s.stage_name);
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${i}`;
      i += 1;
    }
    used.add(candidate);
    return { ...s, stage_key: candidate };
  });
}

const createSchema = z.object({
  workflow_type: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  default_deadline_days: z.number().int().min(0).max(3650).nullable().optional(),
  quantity_based: z.boolean().default(false),
  completion_rule: z
    .enum([
      "all_required_stages_completed",
      "quantity_reached_on_final_stages",
      "terminal_status",
      "never_auto_completes",
    ])
    .default("never_auto_completes"),
  workload_weight: z.number().int().min(1).max(20).default(1),
  category: z.string().max(80).nullable().optional(),
  requires_payment: z.boolean().default(true),
  stages: z.array(stageSchema).min(1).max(30),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: templates } = await supabaseAdmin
    .from("workflow_templates")
    .select("*")
    .order("is_custom", { ascending: true })
    .order("category", { ascending: true, nullsFirst: true })
    .order("title", { ascending: true });

  const ids = (templates ?? []).map((t) => t.id);
  const { data: stages } = ids.length > 0
    ? await supabaseAdmin
        .from("workflow_template_stages")
        .select("*")
        .in("template_id", ids)
        .order("stage_order", { ascending: true })
    : { data: [] };

  const stagesByTemplate: Record<string, unknown[]> = {};
  for (const s of stages ?? []) {
    if (!stagesByTemplate[s.template_id]) stagesByTemplate[s.template_id] = [];
    stagesByTemplate[s.template_id].push(s);
  }

  const withStages = (templates ?? []).map((t) => ({
    ...t,
    stages: stagesByTemplate[t.id] ?? [],
  }));

  return NextResponse.json({ templates: withStages });
}

export async function POST(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;

  // Force the workflow_type into the "custom:" namespace so admin
  // templates can't collide with future built-in types.
  const workflowType = input.workflow_type.startsWith("custom:")
    ? input.workflow_type
    : `custom:${input.workflow_type}`;

  // New version = max existing for this type + 1.
  const { data: existing } = await supabaseAdmin
    .from("workflow_templates")
    .select("version")
    .eq("workflow_type", workflowType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (existing?.version ?? 0) + 1;

  // Insert payload. `requires_payment` only exists once migration 132
  // has run. When the DB predates it PostgREST returns a schema-cache
  // miss on that column name — we detect that and retry without the
  // field so template creation still works before the migration is
  // applied.
  const insertBase = {
    workflow_type: workflowType,
    version,
    title: input.title,
    description: input.description ?? null,
    default_deadline_days: input.default_deadline_days ?? null,
    quantity_based: input.quantity_based,
    completion_rule: input.completion_rule,
    workload_weight: input.workload_weight,
    is_custom: true,
    category: input.category ?? null,
    active: true,
  };
  let template: Record<string, unknown> | null = null;
  let tErr: { message: string } | null = null;
  const first = await supabaseAdmin
    .from("workflow_templates")
    .insert({ ...insertBase, requires_payment: input.requires_payment })
    .select("*")
    .single();
  template = first.data as Record<string, unknown> | null;
  tErr = first.error;
  if (tErr && /requires_payment/i.test(tErr.message)) {
    const retry = await supabaseAdmin
      .from("workflow_templates")
      .insert(insertBase)
      .select("*")
      .single();
    template = retry.data as Record<string, unknown> | null;
    tErr = retry.error;
  }
  if (tErr || !template) {
    return NextResponse.json({ error: tErr?.message ?? "Template insert failed" }, { status: 500 });
  }

  // Slugify stage_key server-side from the typed name. Whatever the
  // admin typed into the stage_key input is ignored — see slugifyStageKey
  // for the rationale.
  const stageRows = assignUniqueKeys(
    input.stages.map((s) => ({
      stage_name: s.stage_name.trim(),
      stage_type: s.stage_type,
      stage_order: s.stage_order,
      required_for_completion: s.required_for_completion,
      customer_visible: s.customer_visible,
      default_customer_message: s.default_customer_message ?? null,
      description: s.description ?? null,
    })),
  ).map((s) => ({
    template_id: template.id,
    stage_key: s.stage_key,
    stage_name: s.stage_name,
    stage_order: s.stage_order,
    stage_type: s.stage_type,
    required_for_completion: s.required_for_completion,
    customer_visible: s.customer_visible,
    default_customer_message: s.default_customer_message,
    description: s.description,
  }));
  const { error: sErr } = await supabaseAdmin
    .from("workflow_template_stages")
    .insert(stageRows);
  if (sErr) {
    // Roll back the template insert to keep the schema consistent.
    await supabaseAdmin.from("workflow_templates").delete().eq("id", template.id);
    return NextResponse.json({ error: `Stage insert failed: ${sErr.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template });
}
