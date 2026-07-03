import { NextRequest, NextResponse } from "next/server";
import { runReconciliation } from "@/lib/paymentReconciliation";
import { writeAuditLog } from "@/lib/paymentLedger";

/**
 * Daily Vercel Cron entry point. Wired at 22:00 UTC (5pm ET) in vercel.json.
 * Also accepts admin-token calls so we can trigger from the reconciliation UI.
 *
 * Auth:
 *   - Vercel Cron sends a "authorization: Bearer $CRON_SECRET" header. We
 *     accept that when CRON_SECRET is configured.
 *   - Otherwise falls back to admin auth (the /admin/financial/reconciliation
 *     page calls this endpoint with an admin's session token).
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

  const summary = await runReconciliation();

  await writeAuditLog({
    actorId: null,
    action: cronOk ? "reconciliation_cron_ran" : "reconciliation_manual_ran",
    entityType: "system",
    metadata: summary as unknown as Record<string, unknown>,
  });

  return NextResponse.json(summary);
}

// Vercel Cron dispatches GET requests
export async function GET(req: NextRequest) { return handle(req); }
// UI "Run now" button uses POST
export async function POST(req: NextRequest) { return handle(req); }
