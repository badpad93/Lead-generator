import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssistantError } from "./errors";

/**
 * Database-counted hourly limits over assistant_messages (role=user).
 * Three keys: the authenticated user, the guest thread, and a keyed
 * hash of the network identifier. Any exceeded key blocks the request
 * BEFORE the model is called. Identifiers are resolved server-side.
 */
export interface RateLimitSubject {
  userId: string | null;
  threadId: string;
  networkHash: string | null;
}

export const NETWORK_LIMIT_MULTIPLIER = 3;
const WINDOW_MS = 60 * 60_000;

async function countSince(column: string, value: string, sinceIso: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("assistant_messages")
    .select("id", { count: "exact", head: true })
    .eq("role", "user")
    .eq(column, value)
    .gte("created_at", sinceIso);
  if (error) {
    console.error("[assistant/rateLimit] count failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function assertWithinRateLimit(subject: RateLimitSubject, limitPerHour: number): Promise<void> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const checks: Array<Promise<[string, number, number]>> = [];
  if (subject.userId) checks.push(countSince("author_user_id", subject.userId, since).then((n) => ["account", n, limitPerHour]));
  else checks.push(countSince("thread_id", subject.threadId, since).then((n) => ["conversation", n, limitPerHour]));
  if (subject.networkHash) {
    checks.push(countSince("network_hash", subject.networkHash, since).then((n) => ["network", n, limitPerHour * NETWORK_LIMIT_MULTIPLIER]));
  }
  const results = await Promise.all(checks);
  const exceeded = results.find(([, n, limit]) => n >= limit);
  if (exceeded) {
    throw new AssistantError("rate_limited", "You have reached the hourly message limit. Please try again a little later.", {
      retry_after_seconds: 900,
      scope: exceeded[0],
    });
  }
}
