import { createHmac, randomBytes, timingSafeEqual } from "crypto";

/**
 * Signed OAuth `state` for the QuickBooks connect flow.
 *
 * The admin-only /api/quickbooks/oauth route mints a state that encodes
 * the initiating admin's user id, an expiry, and a nonce, signed with an
 * HMAC over QB_CLIENT_SECRET. The same value is set as an httpOnly cookie
 * and echoed by Intuit in the callback query string; the callback accepts
 * the code only when both copies are present, identical, unexpired, and
 * carry a valid signature. That gives CSRF protection and lets the
 * callback re-verify the initiator is still an admin before the live
 * connection is touched.
 */
export const QB_OAUTH_STATE_COOKIE = "qb_oauth_state";
export const QB_OAUTH_STATE_TTL_MS = 10 * 60_000;

function secret(env: Record<string, string | undefined>): string {
  const s = env.QB_CLIENT_SECRET;
  if (!s) throw new Error("QB_CLIENT_SECRET not configured");
  return s;
}

function sign(payload: string, env: Record<string, string | undefined>): string {
  return createHmac("sha256", secret(env)).update(payload).digest("base64url");
}

export interface OAuthStatePayload {
  adminUserId: string;
  expiresAt: number;
  nonce: string;
}

/** `<base64url payload>.<signature>` — safe for a query string and a cookie. */
export function mintOAuthState(adminUserId: string, now = Date.now(), env: Record<string, string | undefined> = process.env): string {
  const payload: OAuthStatePayload = { adminUserId, expiresAt: now + QB_OAUTH_STATE_TTL_MS, nonce: randomBytes(12).toString("base64url") };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, env)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function decodePayload(encoded: string): OAuthStatePayload | null {
  try {
    const p = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<OAuthStatePayload>;
    if (typeof p.adminUserId !== "string" || typeof p.expiresAt !== "number" || typeof p.nonce !== "string") return null;
    return p as OAuthStatePayload;
  } catch {
    return null;
  }
}

/** Split `<payload>.<signature>` and check the signature; null when either fails. */
function verifiedPayloadPart(state: string, env: Record<string, string | undefined>): string | null {
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = state.slice(0, dot);
  try {
    return safeEqual(sign(encoded, env), state.slice(dot + 1)) ? encoded : null;
  } catch {
    return null;
  }
}

/**
 * Verify the callback: the query `state` must equal the cookie copy, the
 * signature must validate, and the state must not have expired. Returns
 * the payload or null. Never throws on malformed input.
 */
function matchesCookie(queryState: string | null | undefined, cookieState: string | null | undefined): queryState is string {
  return !!queryState && !!cookieState && safeEqual(queryState, cookieState);
}

export function verifyOAuthState(
  queryState: string | null | undefined,
  cookieState: string | null | undefined,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): OAuthStatePayload | null {
  if (!matchesCookie(queryState, cookieState)) return null;
  const encoded = verifiedPayloadPart(queryState, env);
  if (!encoded) return null;
  const payload = decodePayload(encoded);
  return payload && payload.expiresAt > now ? payload : null;
}
