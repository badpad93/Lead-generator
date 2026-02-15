import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/** POST /api/runs/[id]/stop – abort a running or queued run */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { data: run, error: fetchErr } = await supabaseAdmin
    .from("runs")
    .select("status, progress")
    .eq("id", id)
    .single();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "running" && run.status !== "queued") {
    return NextResponse.json(
      { error: `Run is already ${run.status}` },
      { status: 400 }
    );
  }

  // Try to abort the Apify actor run if we have its ID
  const apifyRunId = run.progress?.apify_run_id;
  if (apifyRunId) {
    const token = process.env.APIFY_API_TOKEN;
    if (token) {
      try {
        await fetch(
          `https://api.apify.com/v2/actor-runs/${apifyRunId}/abort?token=${token}`,
          { method: "POST" }
        );
      } catch {
        // Best-effort abort – continue even if it fails
      }
    }
  }

  // Mark the run as failed/stopped
  const { error: updateErr } = await supabaseAdmin
    .from("runs")
    .update({
      status: "failed",
      progress: {
        total: run.progress?.total ?? 0,
        message: "Stopped by user",
      },
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "Run stopped" });
}
