import { describe, it, expect, beforeEach, vi } from "vitest";
import { createSupabaseStub, type StubStore, type StubWrite } from "./__testutils__/supabaseStub";

const store: StubStore = {};
const writes: StubWrite[] = [];
const stub = createSupabaseStub(store, writes);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

import { AssistantError } from "./errors";
import { generateGuestToken, hashGuestToken } from "./guestToken";
import { acquireRunLock, appendAssistantMessage, appendUserMessage, createThread, findGuestThread, getOwnedThread, persistInterruptedMessage, releaseRunLock, verifyGuestOwnership } from "./threads";
import { assertWithinRateLimit } from "./rateLimit";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  writes.length = 0;
  store.assistant_threads = [];
  store.assistant_messages = [];
  store.assistant_tool_runs = [];
});

describe("thread ownership", () => {
  it("stores only the guest token hash, never the token", async () => {
    const token = generateGuestToken();
    const t = await createThread({ kind: "guest", token }, { promptVersion: "v" });
    const row = store.assistant_threads.find((r) => r.id === t.id)!;
    expect(row.guest_token_hash).toBe(hashGuestToken(token));
    expect(JSON.stringify(store.assistant_threads)).not.toContain(token);
  });

  it("one guest cannot retrieve another guest's thread by id", async () => {
    const a = generateGuestToken();
    const b = generateGuestToken();
    const ta = await createThread({ kind: "guest", token: a }, { promptVersion: "v" });
    await expect(getOwnedThread(ta.id, { kind: "guest", token: b })).rejects.toBeInstanceOf(AssistantError);
    expect(await verifyGuestOwnership(ta.id, b)).toBe(false);
    expect(await verifyGuestOwnership(ta.id, a)).toBe(true);
    expect(await findGuestThread(b)).toBeNull();
    expect((await findGuestThread(a))?.id).toBe(ta.id);
  });

  it("one authenticated user cannot retrieve another user's thread, and a user cannot read a guest thread", async () => {
    const tu = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v" });
    await expect(getOwnedThread(tu.id, { kind: "user", userId: "U2" })).rejects.toMatchObject({ code: "not_found" });
    await expect(getOwnedThread("00000000-0000-0000-0000-000000000000", { kind: "user", userId: "U1" })).rejects.toMatchObject({ code: "not_found" });
    const tg = await createThread({ kind: "guest", token: generateGuestToken() }, { promptVersion: "v" });
    await expect(getOwnedThread(tg.id, { kind: "user", userId: "U1" })).rejects.toMatchObject({ code: "not_found" });
    expect((await getOwnedThread(tu.id, { kind: "user", userId: "U1" })).id).toBe(tu.id);
  });
});

describe("message persistence", () => {
  it("records model, usage, prompt version, and the interrupted flag", async () => {
    const t = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v1" });
    await appendUserMessage({ threadId: t.id, content: "hi", promptVersion: "v1", authorUserId: "U1", networkHash: "abc" });
    const done = await appendAssistantMessage({ threadId: t.id, content: "hello", blocks: [], promptVersion: "v1", usage: { openaiResponseId: "resp_1", model: "m", inputTokens: 10, outputTokens: 5 } });
    const cut = await persistInterruptedMessage({ threadId: t.id, content: "partial", blocks: [{ type: "notice", text: "x" }], promptVersion: "v1", usage: { openaiResponseId: null, model: "m", inputTokens: 3, outputTokens: 1 } });
    const rows = store.assistant_messages;
    const doneRow = rows.find((r) => r.id === done.id)!;
    const cutRow = rows.find((r) => r.id === cut.id)!;
    expect(doneRow).toMatchObject({ role: "assistant", model: "m", input_tokens: 10, output_tokens: 5, openai_response_id: "resp_1", prompt_version: "v1", interrupted: false });
    expect(cutRow).toMatchObject({ interrupted: true, content: "partial", input_tokens: 3 });
    expect(rows.find((r) => r.role === "user")).toMatchObject({ author_user_id: "U1", network_hash: "abc" });
  });

  it("serialises responses on a thread with a run lock", async () => {
    const t = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v" });
    const runId = await acquireRunLock(t.id);
    await expect(acquireRunLock(t.id)).rejects.toMatchObject({ code: "thread_busy" });
    await releaseRunLock(t.id, runId);
    await expect(acquireRunLock(t.id)).resolves.toBeTruthy();
  });
});

describe("rate limiting", () => {
  it("blocks the account, the guest thread, and the network hash once the hourly count is reached", async () => {
    const t = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v" });
    for (let i = 0; i < 3; i += 1) await appendUserMessage({ threadId: t.id, content: `m${i}`, promptVersion: "v", authorUserId: "U1", networkHash: "net" });
    await expect(assertWithinRateLimit({ userId: "U1", threadId: t.id, networkHash: null }, 3)).rejects.toMatchObject({ code: "rate_limited", status: 429 });
    await expect(assertWithinRateLimit({ userId: "U2", threadId: "other", networkHash: null }, 3)).resolves.toBeUndefined();
    await expect(assertWithinRateLimit({ userId: null, threadId: t.id, networkHash: null }, 3)).rejects.toMatchObject({ code: "rate_limited" });
    // Network scope allows NETWORK_LIMIT_MULTIPLIER x the per-user limit.
    await expect(assertWithinRateLimit({ userId: "U3", threadId: "x", networkHash: "net" }, 1)).rejects.toMatchObject({ details: { scope: "network" } });
  });
});
