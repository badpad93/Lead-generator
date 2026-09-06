import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { AssistantError } from "./errors";
import { hashGuestToken, hashesMatch } from "./guestToken";
import type { ToolRunResult } from "./tools/registry";

/**
 * Thread domain service — the only module that touches the three
 * assistant tables. Every read is scoped to an owner the SERVER
 * resolved; the client never supplies user ids, tenant ids, or roles.
 */
export type ThreadOwner =
  | { kind: "user"; userId: string }
  | { kind: "guest"; token: string };

export interface ThreadRow {
  id: string;
  user_id: string | null;
  guest_token_hash: string | null;
  storefront_tenant_id: string | null;
  status: "open" | "closed";
  title: string | null;
  prompt_version: string;
  last_activity_at: string;
  created_at: string;
}

export interface MessageRow {
  id: string;
  thread_id: string;
  role: "user" | "assistant";
  content: string;
  blocks: unknown[];
  model: string | null;
  prompt_version: string;
  input_tokens: number | null;
  output_tokens: number | null;
  interrupted: boolean;
  created_at: string;
}

export interface UsageRecord {
  openaiResponseId: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
}

const THREAD_COLUMNS = "id, user_id, guest_token_hash, storefront_tenant_id, status, title, prompt_version, last_activity_at, created_at";
const MESSAGE_COLUMNS = "id, thread_id, role, content, blocks, model, prompt_version, input_tokens, output_tokens, interrupted, created_at";
export const HISTORY_LIMIT = 30;
const RUN_LOCK_STALE_MS = 3 * 60_000;

function dbFail(op: string, message: string): never {
  console.error(`[assistant/threads] ${op} failed:`, message);
  throw new AssistantError("upstream_error", "The assistant could not reach its conversation store.");
}

function ownerMatches(row: ThreadRow, owner: ThreadOwner): boolean {
  if (owner.kind === "user") return !!row.user_id && row.user_id === owner.userId;
  return !row.user_id && hashesMatch(row.guest_token_hash, hashGuestToken(owner.token));
}

function ownerColumns(owner: ThreadOwner): { user_id: string | null; guest_token_hash: string | null } {
  if (owner.kind === "user") return { user_id: owner.userId, guest_token_hash: null };
  return { user_id: null, guest_token_hash: hashGuestToken(owner.token) };
}

export async function createThread(owner: ThreadOwner, opts: { promptVersion: string; storefrontTenantId?: string | null; title?: string | null }): Promise<ThreadRow> {
  const insert = { ...ownerColumns(owner), storefront_tenant_id: opts.storefrontTenantId ?? null, prompt_version: opts.promptVersion, title: opts.title ?? null, status: "open" as const };
  const { data, error } = await supabaseAdmin.from("assistant_threads").insert(insert).select(THREAD_COLUMNS).single();
  if (error || !data) return dbFail("createThread", error?.message ?? "no row");
  return data as ThreadRow;
}

export async function listUserThreads(userId: string, limit = 20): Promise<ThreadRow[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_threads")
    .select(THREAD_COLUMNS)
    .eq("user_id", userId)
    .order("last_activity_at", { ascending: false })
    .limit(limit);
  if (error) return dbFail("listUserThreads", error.message);
  return (data ?? []) as ThreadRow[];
}

/** The guest's single thread for this token, if any. */
export async function findGuestThread(token: string): Promise<ThreadRow | null> {
  const { data, error } = await supabaseAdmin
    .from("assistant_threads")
    .select(THREAD_COLUMNS)
    .eq("guest_token_hash", hashGuestToken(token))
    .maybeSingle();
  if (error) return dbFail("findGuestThread", error.message);
  const row = data as ThreadRow | null;
  return row && ownerMatches(row, { kind: "guest", token }) ? row : null;
}

/**
 * Load a thread only if `owner` owns it. Unowned and nonexistent threads
 * are indistinguishable (`not_found`).
 */
export async function getOwnedThread(threadId: string, owner: ThreadOwner): Promise<ThreadRow> {
  const { data, error } = await supabaseAdmin.from("assistant_threads").select(THREAD_COLUMNS).eq("id", threadId).maybeSingle();
  if (error) return dbFail("getOwnedThread", error.message);
  const row = data as ThreadRow | null;
  if (!row || !ownerMatches(row, owner)) throw new AssistantError("not_found", "Conversation not found.");
  return row;
}

export async function listMessages(threadId: string, limit = 200): Promise<MessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return dbFail("listMessages", error.message);
  return (data ?? []) as MessageRow[];
}

/** Bounded recent history for model input. */
export async function recentHistory(threadId: string): Promise<MessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) return dbFail("recentHistory", error.message);
  return ((data ?? []) as MessageRow[]).reverse();
}

export async function appendUserMessage(input: {
  threadId: string;
  content: string;
  promptVersion: string;
  authorUserId: string | null;
  networkHash: string | null;
}): Promise<MessageRow> {
  const { data, error } = await supabaseAdmin
    .from("assistant_messages")
    .insert({
      thread_id: input.threadId,
      role: "user",
      content: input.content,
      blocks: [],
      prompt_version: input.promptVersion,
      author_user_id: input.authorUserId,
      network_hash: input.networkHash,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return dbFail("appendUserMessage", error?.message ?? "no row");
  await touchThread(input.threadId);
  return data as MessageRow;
}

async function insertAssistantMessage(input: {
  threadId: string;
  content: string;
  blocks: unknown[];
  promptVersion: string;
  usage: UsageRecord;
  interrupted: boolean;
}): Promise<MessageRow> {
  const { data, error } = await supabaseAdmin
    .from("assistant_messages")
    .insert({
      thread_id: input.threadId,
      role: "assistant",
      content: input.content,
      blocks: input.blocks,
      prompt_version: input.promptVersion,
      openai_response_id: input.usage.openaiResponseId,
      model: input.usage.model,
      input_tokens: input.usage.inputTokens,
      output_tokens: input.usage.outputTokens,
      interrupted: input.interrupted,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error || !data) return dbFail("insertAssistantMessage", error?.message ?? "no row");
  await touchThread(input.threadId);
  return data as MessageRow;
}

export function appendAssistantMessage(input: { threadId: string; content: string; blocks: unknown[]; promptVersion: string; usage: UsageRecord }): Promise<MessageRow> {
  return insertAssistantMessage({ ...input, interrupted: false });
}

export function persistInterruptedMessage(input: { threadId: string; content: string; blocks: unknown[]; promptVersion: string; usage: UsageRecord }): Promise<MessageRow> {
  return insertAssistantMessage({ ...input, interrupted: true });
}

export async function touchThread(threadId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("assistant_threads").update({ last_activity_at: new Date().toISOString() }).eq("id", threadId);
  if (error) console.error("[assistant/threads] touchThread failed:", error.message);
}

export async function setThreadTitle(threadId: string, title: string): Promise<void> {
  const { error } = await supabaseAdmin.from("assistant_threads").update({ title: title.slice(0, 80) }).eq("id", threadId).is("title", null);
  if (error) console.error("[assistant/threads] setThreadTitle failed:", error.message);
}

export async function closeThread(threadId: string, owner: ThreadOwner): Promise<void> {
  await getOwnedThread(threadId, owner);
  const { error } = await supabaseAdmin.from("assistant_threads").update({ status: "closed" }).eq("id", threadId);
  if (error) return dbFail("closeThread", error.message);
}

/** Persist token usage on an already-stored assistant message. */
export async function recordUsage(messageId: string, usage: UsageRecord): Promise<void> {
  const { error } = await supabaseAdmin
    .from("assistant_messages")
    .update({ openai_response_id: usage.openaiResponseId, model: usage.model, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens })
    .eq("id", messageId);
  if (error) console.error("[assistant/threads] recordUsage failed:", error.message);
}

export async function recordToolRun(input: { threadId: string; messageId: string | null; toolName: string; idempotencyKey: string; result: ToolRunResult }): Promise<void> {
  const { error } = await supabaseAdmin.from("assistant_tool_runs").insert({
    thread_id: input.threadId,
    message_id: input.messageId,
    tool_name: input.toolName,
    sanitized_input: input.result.sanitizedInput ?? {},
    output_digest: input.result.outputDigest,
    status: input.result.status,
    error_code: input.result.errorCode,
    idempotency_key: input.idempotencyKey,
    latency_ms: input.result.latencyMs,
  });
  if (error) console.error("[assistant/threads] recordToolRun failed:", error.message);
}

/**
 * Single-writer lock so two responses never stream on one thread at
 * once. Stale locks (crashed function) are taken over after
 * RUN_LOCK_STALE_MS. Returns the run id to release with.
 */
export async function acquireRunLock(threadId: string): Promise<string> {
  const runId = randomUUID();
  const staleBefore = new Date(Date.now() - RUN_LOCK_STALE_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("assistant_threads")
    .update({ active_run_id: runId, active_run_started_at: new Date().toISOString() })
    .eq("id", threadId)
    .or(`active_run_id.is.null,active_run_started_at.lt.${staleBefore}`)
    .select("id");
  if (error) return dbFail("acquireRunLock", error.message);
  if (!data || data.length === 0) throw new AssistantError("thread_busy", "A response is already in progress for this conversation.");
  return runId;
}

export async function releaseRunLock(threadId: string, runId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("assistant_threads")
    .update({ active_run_id: null, active_run_started_at: null })
    .eq("id", threadId)
    .eq("active_run_id", runId);
  if (error) console.error("[assistant/threads] releaseRunLock failed:", error.message);
}

/** Verify a guest token owns a thread without loading messages. */
export async function verifyGuestOwnership(threadId: string, token: string): Promise<boolean> {
  try {
    await getOwnedThread(threadId, { kind: "guest", token });
    return true;
  } catch {
    return false;
  }
}
