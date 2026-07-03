import { NextRequest, NextResponse } from "next/server";
import { runPaymentReminders } from "@/lib/paymentReminders";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * Hourly Vercel Cron entry point for invoice reminder emails.
 * Wired in vercel.json. Auth via CRON_SECRET (same as reconciliation).
 */

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}`;
}

async function isAdminAuthorized(req: NextRequest): Promise<boolean> {
  const { getAdminUserId } = await import("@/lib/adminAuth");
  const adminId = await getAdminUserId(req);
  return !!adminId;
}

async function handle(req: NextRequest): Promise<NextResponse> {
  const cronOk = isCronAuthorized(req);
  const adminOk = cronOk ? true : await isAdminAuthorized(req);
  if (!cronOk && !adminOk) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const summary = await runPaymentReminders();

  await writeAuditLog({
    actorId: null,
    action: cronOk ? "reminders_cron_ran" : "reminders_manual_ran",
    entityType: "system",
    metadata: summary as unknown as Record<string, unknown>,
  });

  return NextResponse.json(summary);
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
