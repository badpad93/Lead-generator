import type OpenAI from "openai";
import type { ResponseInputItem, ResponseStreamEvent } from "openai/resources/responses/responses";
import { AssistantError } from "./errors";
import type { AssistantConfig } from "./config";
import { getOpenAIClient } from "./openaiClient";
import { buildSystemPrompt } from "./systemPrompt";
import type { MessageRow } from "./threads";
import { recordToolRun } from "./threads";
import { dispatchTool, idempotencyKey, openAIToolDefinitions, isToolName, type ToolRunResult } from "./tools/registry";
import type { ToolContext } from "./tools/context";
import { TOOL_LABELS, type SseEventInput, type UiBlock } from "./sse";

/**
 * Responses API orchestration.
 *
 * One turn = one or more `responses.create` calls. The model is given
 * the system prompt, the bounded stored history, and the current
 * round's tool items; it may request function calls, which the
 * application executes and feeds back as `function_call_output` items.
 * Nothing is stored at OpenAI (`store:false`), so every round rebuilds
 * its input from Supabase plus in-memory round items; the loop stops at
 * `maxToolRounds` or when a round produces no tool calls.
 *
 * Reasoning items and summaries are never surfaced or persisted.
 */
export interface RunnerEmitter {
  (event: SseEventInput): void;
}

export interface RunnerResult {
  text: string;
  blocks: UiBlock[];
  usage: { inputTokens: number; outputTokens: number };
  responseId: string | null;
  model: string;
  /** Set when the run ended before a natural completion. */
  interruptedReason: "client_disconnected" | "max_tool_rounds" | "upstream" | null;
}

export interface RunTurnInput {
  config: AssistantConfig;
  history: MessageRow[];
  toolContext: ToolContext;
  emit: RunnerEmitter;
  signal: AbortSignal;
  /** Test seam; defaults to the memoized client. */
  client?: Pick<OpenAI, "responses">;
}

const HISTORY_CHAR_BUDGET = 24_000;
const PER_MESSAGE_CHAR_CAP = 4_000;

interface PendingCall {
  callId: string;
  name: string;
  arguments: string;
}

/** Oldest-first history trimmed to a character budget, newest kept. */
export function historyToInput(history: MessageRow[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];
  let budget = HISTORY_CHAR_BUDGET;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const m = history[i];
    const content = m.content.length > PER_MESSAGE_CHAR_CAP ? `${m.content.slice(0, PER_MESSAGE_CHAR_CAP)}…` : m.content;
    if (!content.trim()) continue;
    if (budget - content.length < 0 && items.length > 0) break;
    budget -= content.length;
    items.unshift({ role: m.role, content });
  }
  return items;
}

type Out = Record<string, unknown>;
const BLOCK_BUILDERS: Record<string, (out: Out) => UiBlock | null> = {
  search_catalog: (out) => ({ type: "product_cards", kind: String(out.kind), items: (out.items as Out[]) ?? [] }),
  get_product_details: (out) => (out.item ? { type: "product_detail", item: out.item as Out } : null),
  compare_products: (out) => ({ type: "comparison", kind: String(out.kind), attribute_labels: (out.attribute_labels as string[]) ?? [], items: (out.items as Out[]) ?? [] }),
  get_customer_context: (out) => ({ type: "customer_context", context: out }),
  get_order_status: (out) => ({ type: "order_status", status: String(out.status), record: (out.record as Out | undefined) ?? null }),
  get_quote: (out) => quoteBlock(out),
  update_quote: (out) => quoteBlock(out),
};

function quoteBlock(out: Out): UiBlock {
  const status = out.status === "quote" || out.status === "guest" ? out.status : "empty";
  return { type: "quote", status, message: typeof out.message === "string" ? out.message : null, quote: (out.quote as Out | undefined) ?? null };
}

function blockFor(tool: string, result: ToolRunResult): UiBlock | null {
  if (!result.ok || !result.output || typeof result.output !== "object") return null;
  const build = BLOCK_BUILDERS[tool];
  return build ? build(result.output as Out) : null;
}

interface StreamOutcome {
  text: string;
  calls: PendingCall[];
  responseId: string | null;
  usage: { inputTokens: number; outputTokens: number };
  status: "completed" | "incomplete" | "failed";
}

const TERMINAL_STATUS: Record<string, StreamOutcome["status"]> = {
  "response.completed": "completed",
  "response.incomplete": "incomplete",
  "response.failed": "failed",
};

function recordTerminal(ev: Extract<ResponseStreamEvent, { response: { id: string } }>, out: StreamOutcome): void {
  out.responseId = ev.response.id;
  out.usage.inputTokens += ev.response.usage?.input_tokens ?? 0;
  out.usage.outputTokens += ev.response.usage?.output_tokens ?? 0;
  out.status = TERMINAL_STATUS[ev.type] ?? "completed";
}

function handleEvent(ev: ResponseStreamEvent, out: StreamOutcome, emit: RunnerEmitter): void {
  if (ev.type === "response.output_text.delta") {
    out.text += ev.delta;
    emit({ type: "text_delta", delta: ev.delta });
    return;
  }
  if (ev.type === "response.output_item.done" && ev.item.type === "function_call") {
    out.calls.push({ callId: ev.item.call_id, name: ev.item.name, arguments: ev.item.arguments });
    return;
  }
  if (ev.type in TERMINAL_STATUS) {
    recordTerminal(ev as Extract<ResponseStreamEvent, { response: { id: string } }>, out);
    return;
  }
  if (ev.type === "error") {
    throw new AssistantError("upstream_error", "The assistant's model service returned an error.");
  }
  // Every other event type (reasoning, refusal parts, in_progress, etc.)
  // is intentionally ignored: never streamed, never persisted.
}

async function streamOneRound(
  client: Pick<OpenAI, "responses">,
  params: Parameters<OpenAI["responses"]["create"]>[0],
  emit: RunnerEmitter,
  signal: AbortSignal,
): Promise<StreamOutcome> {
  const out: StreamOutcome = { text: "", calls: [], responseId: null, usage: { inputTokens: 0, outputTokens: 0 }, status: "completed" };
  const stream = await client.responses.create({ ...params, stream: true }, { signal });
  for await (const ev of stream) {
    if (signal.aborted) break;
    handleEvent(ev, out, emit);
  }
  return out;
}

async function executeCalls(calls: PendingCall[], input: RunTurnInput, blocks: UiBlock[]): Promise<ResponseInputItem[]> {
  const items: ResponseInputItem[] = [];
  for (const call of calls) {
    items.push({ type: "function_call", call_id: call.callId, name: call.name, arguments: call.arguments });
    const result = await executeOne(call, input, blocks);
    items.push({ type: "function_call_output", call_id: call.callId, output: JSON.stringify(result.output) });
  }
  return items;
}

async function executeOne(call: PendingCall, input: RunTurnInput, blocks: UiBlock[]): Promise<ToolRunResult> {
  const unknownTool: ToolRunResult = {
    ok: false,
    output: { error: { code: "invalid_arguments", message: "Unknown tool." } },
    errorCode: "invalid_arguments",
    outputDigest: "",
    latencyMs: 0,
    sanitizedInput: null,
    status: "error",
  };
  if (!isToolName(call.name)) return unknownTool;
  input.emit({ type: "tool_started", tool: call.name, label: TOOL_LABELS[call.name] ?? "Working" });
  const result = await dispatchTool(call.name, call.arguments, input.toolContext, input.signal);
  await recordToolRun({
    threadId: input.toolContext.threadId,
    messageId: null,
    toolName: call.name,
    idempotencyKey: idempotencyKey(input.toolContext.threadId, call.name, call.callId, result.sanitizedInput),
    result,
  });
  input.emit({ type: "tool_completed", tool: call.name, ok: result.ok });
  const block = blockFor(call.name, result);
  if (block) {
    blocks.push(block);
    input.emit({ type: "block", block });
  }
  return result;
}

/**
 * Run one assistant turn. Emits stream events as they happen and returns
 * the final text/blocks/usage for persistence. Throws AssistantError on
 * configuration or upstream failure before any text was produced.
 */
export async function runAssistantTurn(input: RunTurnInput): Promise<RunnerResult> {
  const client = input.client ?? getOpenAIClient();
  const instructions = buildSystemPrompt({ authenticated: !!input.toolContext.profile, storefrontName: input.toolContext.storefront?.display_name ?? null });
  const baseInput = historyToInput(input.history);
  const roundItems: ResponseInputItem[] = [];
  const state: RunnerResult = { text: "", blocks: [], usage: { inputTokens: 0, outputTokens: 0 }, responseId: null, model: input.config.model, interruptedReason: null };

  for (let round = 0; round <= input.config.maxToolRounds; round += 1) {
    const outcome = await streamOneRound(client, roundParams(input, instructions, [...baseInput, ...roundItems]), input.emit, input.signal);
    absorb(state, outcome);
    const stop = stopReason(outcome, input, round, state.text);
    if (stop !== "continue") {
      state.interruptedReason = stop === "done" ? null : stop;
      break;
    }
    roundItems.push(...(await nextRoundItems(outcome, input, state.blocks)));
  }
  return state;
}

function absorb(state: RunnerResult, outcome: StreamOutcome): void {
  state.text += outcome.text;
  addUsage(state.usage, outcome);
  state.responseId = outcome.responseId ?? state.responseId;
}

/** The items appended to the next round's input: any interim assistant text plus each call and its output. */
async function nextRoundItems(outcome: StreamOutcome, input: RunTurnInput, blocks: UiBlock[]): Promise<ResponseInputItem[]> {
  const items: ResponseInputItem[] = outcome.text ? [{ role: "assistant", content: outcome.text }] : [];
  items.push(...(await executeCalls(outcome.calls, input, blocks)));
  return items;
}

function addUsage(total: { inputTokens: number; outputTokens: number }, outcome: StreamOutcome): void {
  total.inputTokens += outcome.usage.inputTokens;
  total.outputTokens += outcome.usage.outputTokens;
}

function roundParams(input: RunTurnInput, instructions: string, items: ResponseInputItem[]): Parameters<OpenAI["responses"]["create"]>[0] {
  return {
    model: input.config.model,
    instructions,
    input: items,
    tools: openAIToolDefinitions({ includeWriteTools: input.toolContext.writeToolsEnabled }),
    tool_choice: "auto",
    parallel_tool_calls: false,
    store: false,
    max_output_tokens: input.config.maxOutputTokens,
  };
}

type StopReason = "continue" | "done" | NonNullable<RunnerResult["interruptedReason"]>;

/** Decide whether the loop continues after a round; throws if the model failed before any text. */
function stopReason(outcome: StreamOutcome, input: RunTurnInput, round: number, textSoFar: string): StopReason {
  if (input.signal.aborted) return "client_disconnected";
  if (outcome.status === "failed") {
    if (!textSoFar) throw new AssistantError("upstream_error", "The assistant could not produce a response.");
    return "upstream";
  }
  if (outcome.calls.length === 0) return "done";
  if (round === input.config.maxToolRounds) return "max_tool_rounds";
  return "continue";
}
