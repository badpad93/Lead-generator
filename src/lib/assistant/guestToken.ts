import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { assistantHashSecret } from "./secrets";

/**
 * Guest conversation ownership.
 *
 * A guest receives a 32-byte random bearer token in an httpOnly cookie.
 * Only the SHA-256 hash is stored on `assistant_threads.guest_token_hash`,
 * so a database read can never be turned into thread access, and a
 * guessed thread UUID is useless without the matching cookie.
 */
export const GUEST_COOKIE = "vc_asst_guest";
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const TOKEN_RE = /^[a-f0-9]{64}$/;

export function generateGuestToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Validate the cookie value's shape before hashing (reject garbage early). */
export function isWellFormedGuestToken(value: string | undefined | null): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

/** Constant-time comparison of two hex digests. */
export function hashesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

export function guestCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  };
}

/**
 * Keyed hash of a network identifier for rate limiting. Raw IPs are
 * never stored. The key is the dedicated assistant secret (see
 * secrets.ts); a missing secret fails closed by throwing rather than
 * silently disabling the network limit. Returns null when no identifier
 * is available.
 */
export function hashNetworkIdentifier(identifier: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  const id = (identifier ?? "").trim();
  if (!id) return null;
  return createHmac("sha256", assistantHashSecret(env)).update(id).digest("hex").slice(0, 32);
}

/** First public address from the forwarded header chain, if any. */
export function networkIdentifierFromHeaders(headers: Headers): string | null {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}
