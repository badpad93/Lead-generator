import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { id } = await params;

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from("candidates")
    .select("*, onboarding_steps(id, step_key, order_index)")
    .eq("id", id)
    .single();

  if (cErr || !candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  const currentStatus = candidate.status;

  if (currentStatus === "pending_admin_review_1") {
    const { data: nextStep } = await supabaseAdmin
      .from("onboarding_steps")
      .select("id")
      .eq("pipeline_id", candidate.current_pipeline_id)
      .eq("step_key", "welcome_docs")
      .single();

    await supabaseAdmin
      .from("candidates")
      .update({
        status: "welcome_docs_sent",
        current_step_id: nextStep?.id || candidate.current_step_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, new_status: "welcome_docs_sent" });
  }

  if (currentStatus === "pending_admin_review_2") {
    const { data: finalStep } = await supabaseAdmin
      .from("onboarding_steps")
      .select("id")
      .eq("pipeline_id", candidate.current_pipeline_id)
      .eq("step_key", "completion")
      .single();

    await supabaseAdmin
      .from("candidates")
      .update({
        status: "completed",
        current_step_id: finalStep?.id || candidate.current_step_id,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, new_status: "completed" });
  }

  return NextResponse.json({ error: `Cannot approve candidate in status: ${currentStatus}` }, { status: 400 });
}
