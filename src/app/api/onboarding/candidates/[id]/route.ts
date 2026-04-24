import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("candidates")
    .select(`
      *,
      candidate_documents(id, step_key, file_name, file_type, file_url, created_at, uploaded_by),
      onboarding_pipelines(id, name, role_type),
      onboarding_steps(id, name, step_key, order_index)
    `)
    .eq("id", id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: allSteps } = await supabaseAdmin
    .from("onboarding_steps")
    .select("id, name, step_key, order_index")
    .eq("pipeline_id", data.current_pipeline_id)
    .order("order_index");

  const { data: emailLogs } = await supabaseAdmin
    .from("email_logs")
    .select("*")
    .eq("candidate_id", id)
    .order("sent_at", { ascending: false });

  return NextResponse.json({ ...data, all_steps: allSteps || [], email_logs: emailLogs || [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = ["full_name", "phone", "email", "application_date", "interview_date", "interview_time", "status", "assigned_to", "notes"];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // "Add to Hiring Pipeline" action
  if (body.action === "add_to_pipeline") {
    const { data: candidate } = await supabaseAdmin
      .from("candidates")
      .select("role_type")
      .eq("id", id)
      .single();

    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    const { data: pipeline } = await supabaseAdmin
      .from("onboarding_pipelines")
      .select("id")
      .eq("role_type", candidate.role_type)
      .single();

    if (!pipeline) return NextResponse.json({ error: "Pipeline not found" }, { status: 400 });

    const { data: firstStep } = await supabaseAdmin
      .from("onboarding_steps")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .order("order_index")
      .limit(1)
      .single();

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("candidates")
      .update({
        status: "interview",
        current_pipeline_id: pipeline.id,
        current_step_id: firstStep?.id || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    return NextResponse.json(updated);
  }

  const { data, error } = await supabaseAdmin
    .from("candidates")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
