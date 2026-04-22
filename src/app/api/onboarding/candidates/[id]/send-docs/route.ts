import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser } from "@/lib/salesAuth";
import { sendOnboardingDocsEmail } from "@/lib/onboardingPipelineEmail";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSalesUser(req);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const { data: candidate, error: cErr } = await supabaseAdmin
    .from("candidates")
    .select("*, onboarding_pipelines(id, role_type), onboarding_steps(step_key)")
    .eq("id", id)
    .single();

  if (cErr || !candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  if (!candidate.email) {
    return NextResponse.json({ error: "Candidate has no email address" }, { status: 400 });
  }

  const stepKey = candidate.onboarding_steps?.step_key;
  if (!stepKey || (stepKey !== "interview" && stepKey !== "welcome_docs")) {
    return NextResponse.json({ error: "Cannot send documents for current step" }, { status: 400 });
  }

  if (stepKey === "interview" && candidate.status !== "interview") {
    return NextResponse.json({ error: "Candidate is not in interview step" }, { status: 400 });
  }

  if (stepKey === "welcome_docs" && candidate.status !== "welcome_docs_sent") {
    return NextResponse.json({ error: "Candidate is not in welcome docs step" }, { status: 400 });
  }

  if (!candidate.full_name || !candidate.interview_date || !candidate.interview_time || !candidate.phone) {
    if (stepKey === "interview") {
      return NextResponse.json({ error: "Please complete all required fields (name, phone, interview date/time) before sending documents" }, { status: 400 });
    }
  }

  try {
    const result = await sendOnboardingDocsEmail({
      candidateId: id,
      candidateEmail: candidate.email,
      candidateName: candidate.full_name,
      stepKey,
      pipelineId: candidate.current_pipeline_id,
      roleType: candidate.onboarding_pipelines?.role_type || candidate.role_type,
    });

    const nextStatus = stepKey === "interview" ? "pending_admin_review_1" : "pending_admin_review_2";
    await supabaseAdmin
      .from("candidates")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ ...result, new_status: nextStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
