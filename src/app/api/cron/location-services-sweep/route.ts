import { NextRequest, NextResponse } from "next/server";
import { runLocationServiceSweep } from "@/lib/locationServicesBilling";

/**
 * Location Services recurring billing sweep.
 *
 * Wired to Vercel Cron daily (see vercel.json); bills any subscription whose
 * weekly invoice is due. Auth via CRON_SECRET; an admin JWT is also accepted
 * so a human can force a run from the browser to debug.
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
  const summary = await runLocationServiceSweep();
  return NextResponse.json(summary);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
