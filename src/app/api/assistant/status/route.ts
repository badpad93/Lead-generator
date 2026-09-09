import { NextResponse } from "next/server";
import { isAssistantEnabled } from "@/lib/assistant/flags";

/**
 * GET /api/assistant/status — `{ enabled }` for the Dashboard / Vinnie
 * mode switch. Read-only and public: it reveals nothing that the 404 on
 * /assistant does not, goes through the fail-closed cached flag reader,
 * and is never consulted for access decisions.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const enabled = await isAssistantEnabled();
  return NextResponse.json({ enabled }, { headers: { "Cache-Control": "no-store" } });
}
