import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore } from "./__testutils__/supabaseStub";
import { createFakeOpenAI, errorRound, textRound, toolRound } from "./__testutils__/fakeOpenAI";

const store: StubStore = {};
const stub = createSupabaseStub(store);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));
vi.mock("@/lib/coffeePricing", () => ({
  resolveCoffeeProductsPricing: async (args: { productIds: string[] }) =>
    new Map(args.productIds.map((id) => [id, { product_id: id, price: 45, shipping_cost: 0, pricing_tier_id: "T1", tier_key: "tier_1", tier_name: "Tier 1", currency: "USD", fallback_used: true, fallback_reason: "no-tier-assigned-defaulted-tier-1" }])),
}));

import { runAssistantTurn, historyToInput } from "./runner";
import { sseEventSchema, type SseEventInput } from "./sse";
import type { AssistantConfig } from "./config";
import type { MessageRow } from "./threads";

const config: AssistantConfig = { apiKey: "k", model: "configured-model", maxOutputTokens: 500, maxToolRounds: 2, rateLimitPerHour: 30, maxMessageLength: 2000 };
const guestCtx = { threadId: "T", profile: null, storefront: null, writeToolsEnabled: false };
const history: MessageRow[] = [{ id: "m1", thread_id: "T", role: "user", content: "show coffee", blocks: [], model: null, prompt_version: "v", input_tokens: null, output_tokens: null, interrupted: false, created_at: "2026-01-01" }];

function collect() {
  const events: SseEventInput[] = [];
  return { events, emit: (e: SseEventInput) => events.push(e) };
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.assistant_tool_runs = [];
  store.coffee_products = [{ id: "P1", name: "Lavazza", sku: "S", description: "d", image_url: null, unit: "case", min_order_qty: 1, pack_quantity: 6, stock_status: "in_stock", active: true, category_id: null, sort_order: 1, coffee_categories: null }];
});

describe("runner — Responses API request shape", () => {
  it("sends store:false, stream:true, the ten strict tools a read-only turn may use, parallel_tool_calls:false, and the configured model", async () => {
    const fake = createFakeOpenAI([textRound("Hello!")]);
    const { emit } = collect();
    await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    const req = fake.requests[0];
    expect(req.store).toBe(false);
    expect(req.stream).toBe(true);
    expect(req.parallel_tool_calls).toBe(false);
    expect(req.tool_choice).toBe("auto");
    expect(req.model).toBe("configured-model");
    expect(req.max_output_tokens).toBe(500);
    const tools = req.tools as Array<{ type: string; strict: boolean; name: string }>;
    expect(tools).toHaveLength(10);
    for (const w of ["update_quote", "start_vending_business_plan", "update_vending_business_plan", "create_quote_from_business_plan", "start_financing_application"]) expect(tools.map((t) => t.name)).not.toContain(w);
    expect(tools.every((t) => t.type === "function" && t.strict === true)).toBe(true);
    expect(req.previous_response_id).toBeUndefined();
    expect(typeof req.instructions).toBe("string");
  });
});

describe("runner — tool rounds", () => {
  it("zero tool rounds: streams text and records usage", async () => {
    const fake = createFakeOpenAI([textRound("Hello!")]);
    const { events, emit } = collect();
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    expect(r.text).toBe("Hello!");
    expect(r.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(r.responseId).toBe("resp_text");
    expect(r.model).toBe("configured-model");
    expect(r.interruptedReason).toBeNull();
    expect(events.map((e) => e.type)).toEqual(["text_delta"]);
  });

  it("one tool round: executes the call in application code, appends function_call_output, emits a block, records the run", async () => {
    const fake = createFakeOpenAI([toolRound("search_catalog", { kind: "coffee", query: null, category_slug: null, limit: 5 }), textRound("Here are results.")]);
    const { events, emit } = collect();
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    expect(fake.requests).toHaveLength(2);
    const second = fake.requests[1].input as Array<Record<string, unknown>>;
    const fc = second.find((i) => i.type === "function_call");
    const out = second.find((i) => i.type === "function_call_output");
    expect(fc).toMatchObject({ call_id: "call_1", name: "search_catalog" });
    expect(out).toMatchObject({ call_id: "call_1" });
    expect(JSON.parse(out!.output as string).items[0].display_price).toBe(45);
    expect(events.map((e) => e.type)).toEqual(["tool_started", "tool_completed", "block", "text_delta"]);
    expect(r.blocks[0].type).toBe("product_cards");
    expect(r.usage).toEqual({ inputTokens: 150, outputTokens: 30 });
    expect(store.assistant_tool_runs).toHaveLength(1);
    expect(store.assistant_tool_runs[0]).toMatchObject({ tool_name: "search_catalog", status: "completed", thread_id: "T" });
  });

  it("multiple sequential rounds run in order and stop when the model stops calling tools", async () => {
    const fake = createFakeOpenAI([
      toolRound("get_customer_context", {}, "call_a"),
      toolRound("search_catalog", { kind: "coffee", query: "lavazza", category_slug: null, limit: 3 }, "call_b"),
      textRound("Done."),
    ]);
    const { events, emit } = collect();
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    expect(fake.requests).toHaveLength(3);
    expect(r.text).toBe("Done.");
    expect(r.interruptedReason).toBeNull();
    expect(events.filter((e) => e.type === "tool_started").map((e) => (e as { tool: string }).tool)).toEqual(["get_customer_context", "search_catalog"]);
    expect(store.assistant_tool_runs).toHaveLength(2);
  });

  it("stops at the configured maximum number of tool rounds", async () => {
    const call = () => toolRound("get_customer_context", {}, `call_${Math.random()}`);
    const fake = createFakeOpenAI([call(), call(), call(), call(), call()]);
    const { emit } = collect();
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    expect(fake.requests).toHaveLength(config.maxToolRounds + 1);
    expect(r.interruptedReason).toBe("max_tool_rounds");
    expect(store.assistant_tool_runs).toHaveLength(config.maxToolRounds);
  });

  it("tool errors become safe model-visible outputs and the run continues", async () => {
    const fake = createFakeOpenAI([toolRound("get_order_status", { order_id: null, order_number: "VC-1" }), textRound("You need to sign in.")]);
    const { events, emit } = collect();
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    const out = (fake.requests[1].input as Array<Record<string, unknown>>).find((i) => i.type === "function_call_output")!;
    const parsed = JSON.parse(out.output as string);
    expect(parsed.error.code).toBe("authentication_required");
    expect(JSON.stringify(parsed)).not.toMatch(/stack|supabase/i);
    expect(events.find((e) => e.type === "tool_completed")).toMatchObject({ ok: false });
    expect(r.text).toBe("You need to sign in.");
    expect(store.assistant_tool_runs[0].status).toBe("refused");
  });

  it("unknown tool names never execute anything", async () => {
    const fake = createFakeOpenAI([toolRound("delete_everything", {}), textRound("ok")]);
    const { emit } = collect();
    await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    const out = (fake.requests[1].input as Array<Record<string, unknown>>).find((i) => i.type === "function_call_output")!;
    expect(JSON.parse(out.output as string).error.code).toBe("invalid_arguments");
    expect(store.assistant_tool_runs).toHaveLength(0);
  });
});

describe("runner — safety", () => {
  it("never streams or persists reasoning content", async () => {
    const fake = createFakeOpenAI([toolRound("get_customer_context", {}), textRound("fine")]);
    const { events, emit } = collect();
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    const all = JSON.stringify(events) + JSON.stringify(r);
    expect(all).not.toContain("SECRET REASONING");
    expect(events.some((e) => (e.type as string).includes("reasoning"))).toBe(false);
  });

  it("every emitted event conforms to the SSE schema", async () => {
    const fake = createFakeOpenAI([toolRound("search_catalog", { kind: "coffee", query: null, category_slug: null, limit: 2 }), textRound("x")]);
    const { events, emit } = collect();
    await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client });
    for (const e of events) expect(sseEventSchema.safeParse({ v: 1, ...e }).success).toBe(true);
  });

  it("reports client disconnects as interrupted", async () => {
    const abort = new AbortController();
    const fake = createFakeOpenAI([textRound("partial")]);
    const emit = (e: SseEventInput) => {
      if (e.type === "text_delta") abort.abort();
    };
    const r = await runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: abort.signal, client: fake.client });
    expect(r.interruptedReason).toBe("client_disconnected");
    expect(r.text).toBe("partial");
  });

  it("surfaces upstream errors as typed operational errors", async () => {
    const fake = createFakeOpenAI([errorRound()]);
    const { emit } = collect();
    await expect(runAssistantTurn({ config, history, toolContext: guestCtx, emit, signal: new AbortController().signal, client: fake.client })).rejects.toMatchObject({ code: "upstream_error" });
  });

  it("bounds the stored history sent to the model", () => {
    const big: MessageRow[] = Array.from({ length: 60 }, (_, i) => ({ ...history[0], id: `m${i}`, content: "x".repeat(3000) }));
    const items = historyToInput(big);
    const chars = items.reduce((n, i) => n + String((i as { content: string }).content).length, 0);
    expect(chars).toBeLessThanOrEqual(24_000 + 3_000);
    expect(items.length).toBeLessThan(60);
  });
});
