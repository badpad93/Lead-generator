import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** POST /api/runs/stop-all – abort all running and queued runs */
export async function POST() {
  // Fetch all active runs
  const { data: activeRuns, error: fetchErr } = await supabaseAdmin
    .from("runs")
    .select("id, status, progress")
    .in("status", ["running", "queued"]);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!activeRuns || activeRuns.length === 0) {
    return NextResponse.json({ ok: true, stopped: 0, message: "No active runs" });
  }

  const token = process.env.APIFY_API_TOKEN;
  let stopped = 0;

  for (const run of activeRuns) {
    // Try to abort the Apify actor run
    const apifyRunId = run.progress?.apify_run_id;
    if (apifyRunId && token) {
      try {
        await fetch(
          `https://api.apify.com/v2/actor-runs/${apifyRunId}/abort?token=${token}`,
          { method: "POST" }
        );
      } catch {
        // best-effort
      }
    }

    await supabaseAdmin
      .from("runs")
      .update({
        status: "failed",
        progress: {
          total: run.progress?.total ?? 0,
          message: "Stopped by user (stop all)",
        },
      })
      .eq("id", run.id);

    stopped++;
  }

  return NextResponse.json({
    ok: true,
    stopped,
    message: `Stopped ${stopped} run(s)`,
  });
}
