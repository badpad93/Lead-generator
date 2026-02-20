import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { triggerApifyActor } from "@/lib/apify";

const MAX_CONCURRENT_RUNS = 3;
const RUN_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

/**
 * GET /api/cron/process-runs
 * Secured by CRON_SECRET header.
 * - Auto-fails runs that have been running longer than RUN_TIMEOUT_MS
 * - Enforces MAX_CONCURRENT_RUNS limit before triggering new actors
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // --- Guardrail 1: Auto-timeout stale runs ---
    const { data: runningRuns } = await supabaseAdmin
      .from("runs")
      .select("id, created_at, progress")
      .eq("status", "running");

    let timedOut = 0;
    if (runningRuns) {
      const now = Date.now();
      for (const run of runningRuns) {
        const age = now - new Date(run.created_at).getTime();
        if (age > RUN_TIMEOUT_MS) {
          // Try to abort the Apify actor
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
                // best-effort
              }
            }
          }
          await supabaseAdmin
            .from("runs")
            .update({
              status: "failed",
              progress: {
                total: run.progress?.total ?? 0,
                message: "Auto-stopped: exceeded 60 minute timeout",
              },
            })
            .eq("id", run.id);
          timedOut++;
        }
      }
    }

    // --- Guardrail 2: Enforce max concurrent runs ---
    const { count: activeCount } = await supabaseAdmin
      .from("runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "running");

    const currentlyRunning = activeCount ?? 0;
    const slotsAvailable = Math.max(0, MAX_CONCURRENT_RUNS - currentlyRunning);

    if (slotsAvailable === 0) {
      return NextResponse.json({
        ok: true,
        triggered: 0,
        timedOut,
        message: `Max concurrent runs (${MAX_CONCURRENT_RUNS}) reached. ${timedOut} timed out.`,
      });
    }

    // Find queued runs, limited to available slots
    const { data: runs, error } = await supabaseAdmin
      .from("runs")
      .select("id")
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(slotsAvailable);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!runs || runs.length === 0) {
      return NextResponse.json({
        ok: true,
        triggered: 0,
        timedOut,
        message: `No pending runs. ${timedOut} timed out.`,
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
      timedOut,
      actorRunIds,
      message: `Triggered ${actorRunIds.length} run(s), ${timedOut} timed out.`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
