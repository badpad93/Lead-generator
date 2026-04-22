import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { pipeline_id } = body;

  if (!pipeline_id) return NextResponse.json({ error: "pipeline_id required" }, { status: 400 });

  const { data: candidate } = await supabaseAdmin
    .from("candidates")
    .select("id, status")
    .eq("id", id)
    .single();

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  if (candidate.status !== "completed") {
    return NextResponse.json({ error: "Candidate must be in completed status" }, { status: 400 });
  }

  await supabaseAdmin
    .from("candidates")
    .update({
      status: "assigned_to_training",
      assigned_training_pipeline_id: pipeline_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ success: true, new_status: "assigned_to_training" });
}
