import { createHmac, timingSafeEqual } from "crypto";

/**
 * Opaque quote reference passed to the existing /financing flow and
 * verified when the application is submitted. Signed with
 * ASSISTANT_HASH_SECRET (falling back to the service-role key, like the
 * assistant's network hash) so a forged reference cannot link a stranger's
 * quote. Ownership is still re-checked server-side on link.
 */
function secret(env: Record<string, string | undefined>): string {
  const s = env.ASSISTANT_HASH_SECRET || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("ASSISTANT_HASH_SECRET or SUPABASE_SERVICE_ROLE_KEY required");
  return s;
}

export function signQuoteRef(quoteId: string, env: Record<string, string | undefined> = process.env): string {
  const sig = createHmac("sha256", secret(env)).update(`quote:${quoteId}`).digest("base64url").slice(0, 32);
  return `${quoteId}.${sig}`;
}

export function verifyQuoteRef(ref: string | null | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!ref) return null;
  const dot = ref.indexOf(".");
  if (dot !== 36) return null;
  const quoteId = ref.slice(0, dot);
  const expected = signQuoteRef(quoteId, env);
  const a = Buffer.from(ref);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? quoteId : null;
}

export function financingReturnUrl(quoteId: string): string {
  return `/financing?quote=${encodeURIComponent(signQuoteRef(quoteId))}`;
}
