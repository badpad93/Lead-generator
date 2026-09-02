import { NextRequest, NextResponse } from "next/server";
import { runInvoiceRetrySweep } from "@/lib/coffeeInvoiceRetry";

/**
 * Coffee invoice recovery sweep.
 *
 * Wired to Vercel Cron every 10 minutes (see vercel.json). Auth via
 * CRON_SECRET (same pattern as the other crons). Admin JWT is also
 * accepted so a human can force a sweep from a browser to debug.
 *
 * See src/lib/coffeeInvoiceRetry.ts for the double-invoice safety
 * strategy — the risk in this whole feature is a duplicate bill, so
 * the safety belt is there and this file is just the transport.
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

  const summary = await runInvoiceRetrySweep();
  console.log("[coffee-invoice-sweep]", JSON.stringify(summary));
  return NextResponse.json(summary);
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
