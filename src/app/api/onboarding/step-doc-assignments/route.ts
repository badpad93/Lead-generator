import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const pipeline_id = url.searchParams.get("pipeline_id");
  const step_key = url.searchParams.get("step_key");

  let query = supabaseAdmin
    .from("step_document_assignments")
    .select("*, document_templates(id, name, pipeline_type, step_key, file_name, version, active)")
    .order("order_index");

  if (pipeline_id) query = query.eq("pipeline_id", pipeline_id);
  if (step_key) query = query.eq("step_key", step_key);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  if (action === "assign") {
    const { pipeline_id, step_key, document_template_id, required, order_index } = body;
    if (!pipeline_id || !step_key || !document_template_id) {
      return NextResponse.json({ error: "pipeline_id, step_key, document_template_id required" }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("step_document_assignments")
      .select("id")
      .eq("pipeline_id", pipeline_id)
      .eq("step_key", step_key)
      .eq("document_template_id", document_template_id)
      .maybeSingle();

    if (existing) return NextResponse.json({ error: "Already assigned" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("step_document_assignments")
      .insert({
        pipeline_id,
        step_key,
        document_template_id,
        required: required !== false,
        order_index: order_index || 0,
      })
      .select("*, document_templates(id, name, file_name, version, active)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  }

  if (action === "remove") {
    const { assignment_id } = body;
    if (!assignment_id) return NextResponse.json({ error: "assignment_id required" }, { status: 400 });

    const { error } = await supabaseAdmin
      .from("step_document_assignments")
      .delete()
      .eq("id", assignment_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "reorder") {
    const { assignments } = body;
    if (!Array.isArray(assignments)) return NextResponse.json({ error: "assignments array required" }, { status: 400 });

    for (const item of assignments) {
      await supabaseAdmin
        .from("step_document_assignments")
        .update({ order_index: item.order_index })
        .eq("id", item.id);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
