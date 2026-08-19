import crypto from "node:crypto";

/**
 * Contractor onboarding secure-link token helpers.
 *
 * Design (closes gaps identified in the audit):
 *   * Raw token = 32 random bytes, base64url encoded → ~43 chars,
 *     safe in URLs, unguessable.
 *   * DB persists only SHA-256(raw) as `token_hash`. Raw is emailed
 *     to the contractor once and never stored server-side.
 *   * Verification uses `crypto.timingSafeEqual` on the two hashes.
 *   * Default TTL 14 days per brief.
 *
 * Regeneration: when admin resends, we can either reuse the existing
 * hash (link stays valid) or issue a new one. The API layer decides;
 * this module just exposes the primitives.
 */

const DEFAULT_TTL_DAYS = 14;

export interface GeneratedToken {
  raw: string;        // send in the emailed URL, then throw away
  hash: string;       // persist this
  expiresAt: string;  // ISO — persist alongside hash
}

/** Generate a new contractor-onboarding token + its hash. */
export function generateOnboardingToken(ttlDays = DEFAULT_TTL_DAYS): GeneratedToken {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  return { raw, hash, expiresAt };
}

/** SHA-256 of the raw token. Same input always yields same output. */
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Constant-time comparison of a raw token (typically from the URL) to
 * a stored hash. Returns true only if hash(raw) === stored hash.
 * timingSafeEqual guards against timing-oracle attacks.
 */
export function verifyToken(raw: string, storedHash: string): boolean {
  if (!raw || !storedHash) return false;
  const computed = hashToken(raw);
  // Both are hex strings of identical length; timingSafeEqual needs Buffers of equal length.
  if (computed.length !== storedHash.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(storedHash, "hex"),
    );
  } catch {
    return false;
  }
}
