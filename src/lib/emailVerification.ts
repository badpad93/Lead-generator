import { randomBytes, createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

const FROM_EMAIL = process.env.FROM_EMAIL || "receipts@bytebitevending.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://vendingconnector.com";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  // 32 bytes -> 64 hex chars, URL safe enough
  return randomBytes(32).toString("hex");
}

export async function createAndSendVerificationEmail(params: {
  userId: string;
  email: string;
  firstName?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { userId, email, firstName } = params;
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "Email service not configured" };
  }

  // Rate limit: max 3/hour, 10/day per email
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { count: hourCount } = await supabaseAdmin
    .from("email_verification_tokens")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", hourAgo);

  if ((hourCount || 0) >= 3) {
    return { ok: false, error: "Too many verification emails sent recently. Please try again in an hour." };
  }

  const { count: dayCount } = await supabaseAdmin
    .from("email_verification_tokens")
    .select("*", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", dayAgo);

  if ((dayCount || 0) >= 10) {
    return { ok: false, error: "Daily verification email limit reached. Please try again tomorrow." };
  }

  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();

  const { error: insertErr } = await supabaseAdmin
    .from("email_verification_tokens")
    .insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

  if (insertErr) {
    return { ok: false, error: "Failed to create verification token" };
  }

  const verifyUrl = `${SITE_URL}/verify-email?token=${rawToken}`;
  const greeting = firstName ? `Hi ${firstName}` : "Hello";

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Verify your Vending Connector account",
      html: `
<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:40px 24px;color:#111827;">
  <div style="text-align:center;margin-bottom:32px;">
    <h1 style="color:#16a34a;font-size:24px;margin:0;">Vending Connector</h1>
    <p style="color:#6b7280;font-size:14px;margin:8px 0 0;">Verify your email address</p>
  </div>

  <p style="font-size:14px;color:#374151;">${greeting},</p>

  <p style="font-size:14px;color:#374151;line-height:1.6;">
    Thanks for creating your Vending Connector account. Please verify your email address by clicking the button below.
  </p>

  <div style="text-align:center;margin:32px 0;">
    <a href="${verifyUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:16px;">Verify Email</a>
  </div>

  <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy and paste this link into your browser:</p>
  <p style="font-size:12px;word-break:break-all;color:#16a34a;">${verifyUrl}</p>

  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;"/>

  <p style="font-size:12px;color:#9ca3af;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>

  <p style="text-align:center;font-size:12px;color:#9ca3af;margin-top:24px;">Vending Connector &bull; vendingconnector.com</p>
</div>
      `.trim(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Failed to send email: ${msg}` };
  }

  return { ok: true };
}

export async function verifyEmailToken(rawToken: string): Promise<{
  ok: boolean;
  userId?: string;
  email?: string;
  error?: string;
}> {
  if (!rawToken || rawToken.length < 32) {
    return { ok: false, error: "Invalid verification token" };
  }

  const tokenHash = hashToken(rawToken);
  const { data: tokenRow, error: lookupErr } = await supabaseAdmin
    .from("email_verification_tokens")
    .select("id, user_id, email, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (lookupErr) return { ok: false, error: "Lookup failed" };
  if (!tokenRow) return { ok: false, error: "Invalid or expired verification link" };
  if (tokenRow.used_at) return { ok: false, error: "This verification link has already been used" };
  if (new Date(tokenRow.expires_at) < new Date()) {
    return { ok: false, error: "Verification link has expired. Please request a new one." };
  }

  // Mark token used
  await supabaseAdmin
    .from("email_verification_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  // Mark Supabase auth email as confirmed (for OAuth-style isVerified checks)
  try {
    await supabaseAdmin.auth.admin.updateUserById(tokenRow.user_id, {
      email_confirm: true,
    });
  } catch {
    // Non-fatal — the profile flag below is what we actually check
  }

  // Mark profile as verified
  await supabaseAdmin
    .from("profiles")
    .update({
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    })
    .eq("id", tokenRow.user_id);

  return { ok: true, userId: tokenRow.user_id, email: tokenRow.email };
}
