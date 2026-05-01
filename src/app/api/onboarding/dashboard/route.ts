import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSalesUser, isElevatedRole } from "@/lib/salesAuth";

export async function GET(req: NextRequest) {
  const user = await getSalesUser(req);
  if (!user || !isElevatedRole(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: candidates, error } = await supabaseAdmin
    .from("candidates")
    .select("id, status, role_type, created_at, onboarding_completed_at, terminated_at, application_date");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const all = candidates || [];
  const total = all.length;
  const interviewing = all.filter((c) => c.status === "interview").length;
  const pendingReview = all.filter((c) => c.status === "pending_admin_review_1" || c.status === "pending_admin_review_2" || c.status === "interview_complete").length;
  const welcomeDocs = all.filter((c) => c.status === "welcome_docs_sent").length;
  const completed = all.filter((c) => c.status === "completed").length;
  const assignedToTraining = all.filter((c) => c.status === "assigned_to_training").length;
  const terminated = all.filter((c) => c.status === "terminated").length;
  const onboarded = all.filter((c) =>
    c.status === "completed" || c.status === "assigned_to_training"
  ).length;
  const active = all.filter((c) => c.status !== "terminated").length;

  const turnoverRate = onboarded > 0 ? Math.round((terminated / (onboarded + terminated)) * 100) : 0;

  const stageCounts = [
    { stage: "Interview", count: interviewing },
    { stage: "Pending Review", count: pendingReview },
    { stage: "Welcome Docs", count: welcomeDocs },
    { stage: "Completed", count: completed },
    { stage: "Training", count: assignedToTraining },
    { stage: "Terminated", count: terminated },
  ];

  const byRole = {
    BDP: all.filter((c) => c.role_type === "BDP").length,
    MARKET_LEADER: all.filter((c) => c.role_type === "MARKET_LEADER").length,
  };

  const durations: number[] = [];
  for (const c of all) {
    if (c.onboarding_completed_at && c.created_at) {
      const days = Math.round(
        (new Date(c.onboarding_completed_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      durations.push(days);
    }
  }
  const avgOnboardingDays = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;

  return NextResponse.json({
    total,
    interviewing,
    pendingReview,
    welcomeDocs,
    onboarded,
    completed,
    assignedToTraining,
    active,
    terminated,
    turnoverRate,
    stageCounts,
    byRole,
    avgOnboardingDays,
  });
}
