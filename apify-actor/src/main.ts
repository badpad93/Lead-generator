/**
 * Apify actor entry point for the lead-generator worker.
 *
 * Input: { runId: string }
 * Environment variables (set in Apify actor settings):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   APIFY_TOKEN is injected automatically by the Apify runtime.
 */

import { Actor } from "apify";
import { createClient } from "@supabase/supabase-js";
import { processRun } from "./worker.js";

interface Input {
  runId: string;
}

await Actor.init();

try {
  const input = (await Actor.getInput<Input>()) ?? ({} as Input);

  if (!input.runId) {
    throw new Error("Missing required input: runId");
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Fetch the run details
  const { data: run, error } = await supabase
    .from("runs")
    .select("*")
    .eq("id", input.runId)
    .single();

  if (error || !run) {
    throw new Error(`Run ${input.runId} not found: ${error?.message ?? "no data"}`);
  }

  // Bail out if already stopped/done (user hit Stop before actor started)
  if (run.status === "failed" || run.status === "done") {
    console.log(`[actor] Run ${run.id} is already ${run.status}, skipping`);
  } else {
    // Set to running if queued
    if (run.status === "queued") {
      await supabase
        .from("runs")
        .update({
          status: "running",
          progress: { total: 0, message: "Starting…" },
        })
        .eq("id", run.id);
    }

    console.log(`[actor] Starting run ${run.id}: ${run.city}, ${run.state}`);
    await processRun(supabase, run);
    console.log(`[actor] Finished run ${run.id}`);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[actor] Fatal error: ${msg}`);
  throw e;
} finally {
  await Actor.exit();
}
