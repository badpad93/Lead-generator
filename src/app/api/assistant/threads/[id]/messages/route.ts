import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveActor, toolContextFor, type Actor } from "@/lib/assistant/actor";
import { getAssistantConfig, getAssistantLimits, PROMPT_VERSION } from "@/lib/assistant/config";
import { AssistantError, errorBody, isAssistantError } from "@/lib/assistant/errors";
import { hashNetworkIdentifier, networkIdentifierFromHeaders } from "@/lib/assistant/guestToken";
import { assertEnabled, toErrorResponse } from "@/lib/assistant/http";
import { assertWithinRateLimit } from "@/lib/assistant/rateLimit";
import { isAssistantWriteToolsEnabled } from "@/lib/assistant/flags";
import { redactUserMessage } from "@/lib/assistant/redact";
import { runAssistantTurn, type RunnerResult } from "@/lib/assistant/runner";
import { encodeSseEvent, SSE_HEADERS, type SseEventInput, type UiBlock } from "@/lib/assistant/sse";
import {
  acquireRunLock,
  appendAssistantMessage,
  appendUserMessage,
  getOwnedThread,
  persistInterruptedMessage,
  recentHistory,
  releaseRunLock,
  setThreadTitle,
  type ThreadOwner,
  type ThreadRow,
} from "@/lib/assistant/threads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({ content: z.string().min(1).max(20_000) }).strict();

function ownerFromActor(actor: Actor): ThreadOwner {
  if (actor.kind === "user") return { kind: "user", userId: actor.profile.id };
  if (actor.kind === "guest") return { kind: "guest", token: actor.token };
  throw new AssistantError("not_found", "Conversation not found.");
}

interface Prepared {
  thread: ThreadRow;
  actor: Actor;
  content: string;
  notice: string | null;
  networkHash: string | null;
}

/**
 * Everything that must succeed BEFORE the stream opens: flag, identity,
 * ownership, validation, redaction, rate limit, config. Failures here
 * return ordinary JSON errors; only a fully prepared turn streams.
 */
async function prepare(req: NextRequest, threadId: string): Promise<Prepared> {
  await assertEnabled();
  if (!z.string().uuid().safeParse(threadId).success) throw new AssistantError("not_found", "Conversation not found.");
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) throw new AssistantError("invalid_input", "A message is required.");
  const actor = await resolveActor(req);
  const thread = await getOwnedThread(threadId, ownerFromActor(actor));
  if (thread.status !== "open") throw new AssistantError("invalid_input", "This conversation is closed.");
  const limits = getAssistantLimits();
  const redacted = redactUserMessage(parsed.data.content, limits.maxMessageLength);
  if (redacted.rejected) {
    throw new AssistantError("sensitive_input_rejected", redacted.notice ?? "That message could not be accepted.");
  }
  const networkHash = hashNetworkIdentifier(networkIdentifierFromHeaders(req.headers));
  await assertWithinRateLimit(
    { userId: actor.kind === "user" ? actor.profile.id : null, threadId: thread.id, networkHash },
    limits.rateLimitPerHour,
  );
  // Config is checked last so a misconfigured deployment still enforces
  // the limits above without ever calling OpenAI.
  getAssistantConfig();
  return { thread, actor, content: redacted.text, notice: redacted.notice, networkHash };
}

function finalBlocks(result: RunnerResult, notice: string | null): UiBlock[] {
  return notice ? [{ type: "notice", text: notice }, ...result.blocks] : result.blocks;
}

async function persistOutcome(p: Prepared, result: RunnerResult, notice: string | null, aborted: boolean): Promise<{ id: string; interrupted: boolean }> {
  const usage = { openaiResponseId: result.responseId, model: result.model, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens };
  const common = { threadId: p.thread.id, content: result.text, blocks: finalBlocks(result, notice), promptVersion: PROMPT_VERSION, usage };
  if (aborted || result.interruptedReason) {
    const m = await persistInterruptedMessage(common);
    return { id: m.id, interrupted: true };
  }
  const m = await appendAssistantMessage(common);
  return { id: m.id, interrupted: false };
}

interface StreamJob {
  p: Prepared;
  userMessageId: string;
  runId: string;
  send: (e: SseEventInput) => void;
  signal: AbortSignal;
}

async function runStream({ p, userMessageId, runId, send, signal }: StreamJob): Promise<void> {
  const config = getAssistantConfig();
  const history = await recentHistory(p.thread.id);
  send({ type: "response_started", thread_id: p.thread.id, user_message_id: userMessageId });
  if (p.notice) send({ type: "block", block: { type: "notice", text: p.notice } });
  let result: RunnerResult | null = null;
  try {
    const writeTools = await isAssistantWriteToolsEnabled();
    result = await runAssistantTurn({ config, history, toolContext: toolContextFor(p.actor, p.thread.id, writeTools), emit: send, signal });
    const saved = await persistOutcome(p, result, p.notice, signal.aborted);
    if (saved.interrupted) send({ type: "response_interrupted", message_id: saved.id, reason: result.interruptedReason ?? "client_disconnected" });
    else send({ type: "response_completed", message_id: saved.id, usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens } });
  } catch (e) {
    const err = isAssistantError(e) ? e : new AssistantError("upstream_error", "The assistant could not complete that response.");
    console.error("[assistant/messages] run failed:", e instanceof Error ? e.message : String(e));
    send({ type: "error", code: err.code, message: err.message });
  } finally {
    await releaseRunLock(p.thread.id, runId);
  }
}

/** POST /api/assistant/threads/[id]/messages — append a user turn and stream the reply. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let prepared: Prepared;
  let runId: string;
  try {
    prepared = await prepare(req, id);
    runId = await acquireRunLock(prepared.thread.id);
  } catch (e) {
    return toErrorResponse(e);
  }

  let userMessageId: string;
  try {
    const userMessage = await appendUserMessage({
      threadId: prepared.thread.id,
      content: prepared.content,
      promptVersion: PROMPT_VERSION,
      authorUserId: prepared.actor.kind === "user" ? prepared.actor.profile.id : null,
      networkHash: prepared.networkHash,
    });
    userMessageId = userMessage.id;
    if (!prepared.thread.title) await setThreadTitle(prepared.thread.id, prepared.content.slice(0, 80));
  } catch (e) {
    await releaseRunLock(prepared.thread.id, runId);
    const err = isAssistantError(e) ? e : new AssistantError("upstream_error", "Could not save your message.");
    return NextResponse.json(errorBody(err), { status: err.status });
  }

  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: SseEventInput) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(e)));
        } catch {
          closed = true;
        }
      };
      runStream({ p: prepared, userMessageId, runId, send, signal: abort.signal }).finally(() => {
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}
