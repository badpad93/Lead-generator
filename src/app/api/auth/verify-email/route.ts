import { NextRequest, NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body.token || "");
    const result = await verifyEmailToken(token);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Verification failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, email: result.email });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
