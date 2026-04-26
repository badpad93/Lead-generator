import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { checkStepGating } from "@/lib/stepGating";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const direction = body.direction || "next";

  const { data: item, error: itemErr } = await supabaseAdmin
    .from("pipeline_items")
    .select("*")
    .eq("id", id)
    .single();

  if (itemErr || !item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.status !== "active") {
    return NextResponse.json({ error: "Cannot move a won/lost item" }, { status: 422 });
  }

  const { data: steps } = await supabaseAdmin
    .from("pipeline_steps")
    .select("*, step_documents(*)")
    .eq("pipeline_id", item.pipeline_id)
    .order("order_index");

  if (!steps || steps.length === 0) {
    return NextResponse.json({ error: "Pipeline has no steps" }, { status: 422 });
  }

  const currentIdx = steps.findIndex((s) => s.id === item.current_step_id);
  if (currentIdx === -1) {
    return NextResponse.json({ error: "Current step not found" }, { status: 422 });
  }

  if (direction === "back") {
    if (currentIdx === 0) {
      return NextResponse.json({ error: "Already at first step" }, { status: 422 });
    }
    const prevStep = steps[currentIdx - 1];
    const { data, error } = await supabaseAdmin
      .from("pipeline_items")
      .update({ current_step_id: prevStep.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...data, moved_to: prevStep.name });
  }

  // Moving forward — full step gating validation
  const gating = await checkStepGating(id, item.current_step_id);

  if (!gating.canAdvance) {
    return NextResponse.json({
      error: gating.blockers.join("; "),
      blockers: gating.blockers,
      requirements: gating.requirements,
    }, { status: 422 });
  }

  if (currentIdx === steps.length - 1) {
    const { data, error } = await supabaseAdmin
      .from("pipeline_items")
      .update({ status: "won", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...data, completed: true });
  }

  const nextStep = steps[currentIdx + 1];
  const { data, error } = await supabaseAdmin
    .from("pipeline_items")
    .update({ current_step_id: nextStep.id, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, moved_to: nextStep.name });
}
