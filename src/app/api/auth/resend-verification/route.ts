import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createAndSendVerificationEmail } from "@/lib/emailVerification";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

    // Look up user
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const user = users?.users?.find((u) => u.email?.toLowerCase() === email);

    // Even if no user, return success-like response to avoid email enumeration.
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // If already verified, return success without sending
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email_verified, full_name")
      .eq("id", user.id)
      .single();

    if (profile?.email_verified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const firstName = profile?.full_name?.split(" ")[0];
    const result = await createAndSendVerificationEmail({
      userId: user.id,
      email,
      firstName,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Failed to send verification email" }, { status: 429 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
