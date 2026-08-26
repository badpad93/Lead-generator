import crypto from "node:crypto";

/**
 * Payroll invitation token helpers. Same design as
 * src/lib/contractorOnboarding/token.ts — kept independent so
 * either flow can evolve without dragging the other.
 *
 * Raw token = 32 random bytes → base64url. Stored only as its
 * SHA-256 hash. Verified with timingSafeEqual.
 */

const DEFAULT_TTL_DAYS = 21;

export interface GeneratedToken {
  raw: string;
  hash: string;
  expiresAt: string;
}

export function generatePayrollToken(ttlDays = DEFAULT_TTL_DAYS): GeneratedToken {
  const raw = crypto.randomBytes(32).toString("base64url");
  const hash = hashToken(raw);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  return { raw, hash, expiresAt };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function verifyToken(raw: string, storedHash: string): boolean {
  if (!raw || !storedHash) return false;
  const computed = hashToken(raw);
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
