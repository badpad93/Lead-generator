/**
 * The assistant's dedicated HMAC secret. It keys the network-identifier
 * hash used for rate limiting and the opaque quote reference handed to the
 * financing flow.
 *
 * It is never derived from, and never falls back to, the Supabase
 * service-role key: that key authorises every database write, and a
 * value that signs customer-visible references must not double as it.
 * Outside the test runner a missing value fails closed.
 */
export const ASSISTANT_HASH_SECRET_NAME = "ASSISTANT_HASH_SECRET";
const TEST_ONLY_SECRET = "assistant-test-secret-not-for-deployment";

export class AssistantSecretMissingError extends Error {
  constructor() {
    super(`${ASSISTANT_HASH_SECRET_NAME} is not configured. Set a dedicated value; it must not be the service-role key.`);
    this.name = "AssistantSecretMissingError";
  }
}

export function assistantHashSecret(env: Record<string, string | undefined> = process.env): string {
  const value = env[ASSISTANT_HASH_SECRET_NAME]?.trim();
  if (value) {
    if (env.SUPABASE_SERVICE_ROLE_KEY && value === env.SUPABASE_SERVICE_ROLE_KEY) throw new AssistantSecretMissingError();
    return value;
  }
  if (env.NODE_ENV === "test") return TEST_ONLY_SECRET;
  throw new AssistantSecretMissingError();
}
