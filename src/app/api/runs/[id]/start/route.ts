import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { triggerApifyActor } from "@/lib/apify";

/** POST /api/runs/[id]/start – kick off processing via Apify actor */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check current status
  const { data: run, error: fetchErr } = await supabaseAdmin
    .from("runs")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchErr || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "queued") {
    return NextResponse.json(
      { error: `Run is already ${run.status}` },
      { status: 400 }
    );
  }

  // Set to running
  const { error: updateErr } = await supabaseAdmin
    .from("runs")
    .update({
      status: "running",
      progress: { total: 0, message: "Starting…" },
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Trigger the Apify actor (fire-and-forget – actor runs independently)
  try {
    const actorRunId = await triggerApifyActor(id);

    // Store the Apify run ID so we can abort it later
    await supabaseAdmin
      .from("runs")
      .update({
        progress: { total: 0, message: "Starting…", apify_run_id: actorRunId },
      })
      .eq("id", id);

    return NextResponse.json({ ok: true, actorRunId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Revert status so user can retry
    await supabaseAdmin
      .from("runs")
      .update({
        status: "queued",
        progress: { total: 0, message: "Failed to start – queued for retry" },
      })
      .eq("id", id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
