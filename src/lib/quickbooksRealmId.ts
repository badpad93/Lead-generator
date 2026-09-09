/**
 * QuickBooks Online company ("realm") identifiers are opaque numeric strings
 * issued by Intuit and echoed back on the OAuth callback query string. The
 * callback interpolates the value into an Accounting API URL, so anything
 * other than a short run of ASCII digits is rejected before any request is
 * built: no path separators, dots, percent-encoding, hosts, schemes,
 * whitespace, signs, exponents, or non-ASCII digits can ever reach a URL.
 *
 * Deliberately standalone: it imports nothing and is the only new module the
 * callback route depends on, so the existing payment client is untouched.
 */
export const QB_REALM_ID_MAX_LENGTH = 32;
const REALM_ID = /^[0-9]{1,32}$/;

/** Returns the realm id unchanged when it is 1-32 ASCII digits, otherwise null. */
export function parseQuickBooksRealmId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return REALM_ID.test(value) ? value : null;
}
