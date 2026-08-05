import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAdminUserId } from "@/lib/adminAuth";

/**
 * GET   /api/admin/inventory/configuration — single-row global config
 * PATCH /api/admin/inventory/configuration — update defaults
 *
 * current_formula_version is intentionally NOT patchable through the
 * UI — bumping it is a code+math decision, not an admin control.
 * Editing formula version silently would break the reproducibility
 * contract on future recommendations.
 */

const weightBucketSchema = z.object({
  weeks_back_from: z.number().int().min(1),
  weeks_back_to: z.number().int().min(1),
  weight: z.number().min(0),
});

const patchSchema = z.object({
  default_lookback_weeks: z.number().int().min(6).max(12).optional(),
  default_safety_stock_pct: z.number().min(0).max(1).optional(),
  default_order_cycle_days: z.number().int().min(1).optional(),
  default_forecast_method: z.enum(["simple", "weighted"]).optional(),
  default_weight_config: z.array(weightBucketSchema).min(1).optional(),
  default_warehouse_id: z.string().uuid().nullable().optional(),
  spike_threshold_multiplier: z.number().min(1).max(10).optional(),
  min_valid_weeks: z.number().int().min(1).max(12).optional(),
});

export async function GET(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("inventory_configuration")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "configuration row missing" }, { status: 500 });
  return NextResponse.json({ configuration: data });
}

export async function PATCH(req: NextRequest) {
  const adminId = await getAdminUserId(req);
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const { data: existing } = await supabaseAdmin
    .from("inventory_configuration")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "configuration row missing" }, { status: 500 });
  }

  const attemptFullPatch = async () => {
    return await supabaseAdmin
      .from("inventory_configuration")
      .update({ ...parsed.data, updated_by: adminId, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
  };

  let { data, error } = await attemptFullPatch();

  // If migration 140 hasn't been applied yet, retry without the new
  // column so config can still be edited pre-migration.
  if (error && /default_warehouse_id/i.test(error.message)) {
    const { default_warehouse_id: _dw, ...rest } = parsed.data as Record<string, unknown>;
    void _dw;
    const retry = await supabaseAdmin
      .from("inventory_configuration")
      .update({ ...rest, updated_by: adminId, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("*")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configuration: data });
}
