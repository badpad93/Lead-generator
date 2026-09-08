import { createHmac, timingSafeEqual } from "crypto";
import { assistantHashSecret } from "@/lib/assistant/secrets";

/**
 * Opaque quote reference passed to the existing /financing flow and
 * verified when the application is submitted. Signed with the dedicated
 * assistant secret (never the service-role key) so a forged reference
 * cannot link a stranger's quote. Ownership is still re-checked
 * server-side on link.
 */
const secret = assistantHashSecret;

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
