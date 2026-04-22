import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const role_type = url.searchParams.get("role_type");
  const pipeline_id = url.searchParams.get("pipeline_id");

  let query = supabaseAdmin
    .from("candidates")
    .select("*, candidate_documents(id, step_key, file_name), onboarding_pipelines(id, name, role_type), onboarding_steps(id, name, step_key)")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (role_type) query = query.eq("role_type", role_type);
  if (pipeline_id) query = query.eq("current_pipeline_id", pipeline_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { full_name, phone, email, role_type, application_date, interview_date, interview_time } = body;

  if (!full_name || !role_type) {
    return NextResponse.json({ error: "full_name and role_type required" }, { status: 400 });
  }

  const { data: pipeline } = await supabaseAdmin
    .from("onboarding_pipelines")
    .select("id")
    .eq("role_type", role_type)
    .single();

  if (!pipeline) return NextResponse.json({ error: "Pipeline not found for role type" }, { status: 400 });

  const { data: firstStep } = await supabaseAdmin
    .from("onboarding_steps")
    .select("id")
    .eq("pipeline_id", pipeline.id)
    .order("order_index")
    .limit(1)
    .single();

  const { data, error } = await supabaseAdmin
    .from("candidates")
    .insert({
      full_name,
      phone: phone || null,
      email: email || null,
      role_type,
      application_date: application_date || new Date().toISOString().split("T")[0],
      interview_date: interview_date || null,
      interview_time: interview_time || null,
      status: "interview",
      current_pipeline_id: pipeline.id,
      current_step_id: firstStep?.id || null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
