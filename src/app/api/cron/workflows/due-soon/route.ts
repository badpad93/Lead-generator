import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchNotification } from "@/lib/workflows/notifications";

/**
 * GET /api/cron/workflows/due-soon
 *
 * Called daily by the scheduled cron. Fires:
 *   - deadline.due_soon for every open workflow within
 *     WORKFLOWS_DUE_SOON_DAYS (default 7) of its due date
 *   - deadline.overdue for every open workflow past its due date
 *
 * send_once=false on those rules, so this endpoint safely fires each
 * day until the workflow completes or the assignee acknowledges.
 *
 * Auth: same shared CRON_SECRET header pattern used by other crons in
 * this app.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const soonDays = Number(process.env.WORKFLOWS_DUE_SOON_DAYS ?? 7);
  const nowIso = new Date().toISOString();
  const soonIso = new Date(Date.now() + soonDays * 86400_000).toISOString();

  const openStatuses = [
    "not_started",
    "in_progress",
    "waiting_on_customer",
    "waiting_on_vendor",
    "ready_to_begin",
    "at_risk",
  ];

  // Due-soon set: open, has a due_date within [now, now+soonDays], not overdue yet.
  const { data: dueSoon } = await supabaseAdmin
    .from("workflows")
    .select("id")
    .in("overall_status", openStatuses)
    .gt("due_date", nowIso)
    .lte("due_date", soonIso);

  const { data: overdue } = await supabaseAdmin
    .from("workflows")
    .select("id")
    .in("overall_status", [...openStatuses, "overdue"])
    .lt("due_date", nowIso);

  let dueSoonSent = 0;
  let overdueSent = 0;

  for (const w of dueSoon ?? []) {
    try {
      await dispatchNotification({ workflowId: w.id, trigger: "deadline.due_soon" });
      dueSoonSent += 1;
    } catch (err) {
      console.error("[cron.workflows.due-soon] dispatch failed:", err);
    }
  }
  for (const w of overdue ?? []) {
    try {
      await dispatchNotification({ workflowId: w.id, trigger: "deadline.overdue" });
      overdueSent += 1;
    } catch (err) {
      console.error("[cron.workflows.due-soon] overdue dispatch failed:", err);
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: (dueSoon?.length ?? 0) + (overdue?.length ?? 0),
    dueSoonSent,
    overdueSent,
  });
}

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no gate configured → allow (dev)
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? req.nextUrl.searchParams.get("secret");
  return provided === secret;
}
