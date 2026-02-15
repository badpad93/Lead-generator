import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { triggerApifyActor } from "@/lib/apify";

/**
 * GET /api/cron/process-runs
 * Secured by CRON_SECRET header.
 * Finds queued runs and triggers Apify actors for each.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all queued runs
    const { data: runs, error } = await supabaseAdmin
      .from("runs")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!runs || runs.length === 0) {
      return NextResponse.json({
        ok: true,
        triggered: 0,
        message: "No pending runs",
      });
    }

    const actorRunIds: string[] = [];
    for (const run of runs) {
      // Set to running
      await supabaseAdmin
        .from("runs")
        .update({
          status: "running",
          progress: { total: 0, message: "Starting…" },
        })
        .eq("id", run.id);

      const actorRunId = await triggerApifyActor(run.id);
      actorRunIds.push(actorRunId);

      // Store the Apify run ID so we can abort it later
      await supabaseAdmin
        .from("runs")
        .update({
          progress: { total: 0, message: "Starting…", apify_run_id: actorRunId },
        })
        .eq("id", run.id);
    }

    return NextResponse.json({
      ok: true,
      triggered: actorRunIds.length,
      actorRunIds,
      message: `Triggered ${actorRunIds.length} actor run(s)`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
