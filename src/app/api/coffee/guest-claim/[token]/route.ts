import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { claimProvisionalAccount } from "@/lib/auth/provisionalAccount";

/**
 * GET  /api/coffee/guest-claim/[token] — validate a password-set token
 *  and return whether it's usable. Returns { email } on success so the
 *  claim page can pre-fill or greet the user.
 * POST /api/coffee/guest-claim/[token] — set the password + flip
 *  is_provisional=false in a single transaction-ish flow. Returns 200
 *  once the account is claimed.
 *
 * Tokens are single-use — password_token_used_at is set on POST so a
 * leaked link can't be replayed. If the token was already used or has
 * expired we return 410 Gone so the page can show a "link expired" state
 * that offers to resend.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const { data: session } = await supabaseAdmin
    .from("guest_checkout_sessions")
    .select("id, email, password_token_expires_at, password_token_used_at, provisioned_user_id")
    .eq("password_token", token)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  if (session.password_token_used_at) {
    return NextResponse.json({ error: "This link has already been used." }, { status: 410 });
  }
  if (new Date(session.password_token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  return NextResponse.json({ email: session.email });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const { data: session } = await supabaseAdmin
    .from("guest_checkout_sessions")
    .select("id, email, provisioned_user_id, password_token_expires_at, password_token_used_at")
    .eq("password_token", token)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ error: "Link not found." }, { status: 404 });
  }
  if (session.password_token_used_at) {
    return NextResponse.json({ error: "This link has already been used." }, { status: 410 });
  }
  if (new Date(session.password_token_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 410 });
  }

  try {
    await claimProvisionalAccount(session.provisioned_user_id, password);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to claim account.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await supabaseAdmin
    .from("guest_checkout_sessions")
    .update({
      password_token_used_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    })
    .eq("id", session.id);

  return NextResponse.json({ ok: true, email: session.email });
}
