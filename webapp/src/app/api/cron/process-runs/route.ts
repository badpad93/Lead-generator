import { NextRequest, NextResponse } from "next/server";
import { processNextRun } from "@/lib/worker";

/**
 * GET /api/cron/process-runs
 * Secured by CRON_SECRET header.
 * Called by Vercel Cron or externally to process the next queued/running run.
 */
export const maxDuration = 300; // 5 minutes (Vercel Pro limit)

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const processed = await processNextRun();
    return NextResponse.json({
      ok: true,
      processed,
      message: processed ? "Run processed" : "No pending runs",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
