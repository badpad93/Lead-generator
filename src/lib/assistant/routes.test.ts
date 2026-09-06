import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseStub, type StubStore } from "./__testutils__/supabaseStub";

/**
 * Route-level guarantees: the disabled flag and the rate limit both stop
 * a request before any OpenAI client is constructed, and sensitive input
 * is rejected before persistence.
 */
const store: StubStore = {};
const stub = createSupabaseStub(store);
vi.mock("@/lib/supabaseAdmin", () => ({ supabaseAdmin: { from: (t: string) => stub.from(t) } }));

const flags = { enabled: false };
vi.mock("@/lib/storefront/flags", () => ({ isStorefrontFlagEnabled: async () => flags.enabled }));

const actorState: { kind: "user" | "guest"; token: string } = { kind: "user", token: "" };
vi.mock("./actor", () => ({
  resolveActor: async () =>
    actorState.kind === "user"
      ? { kind: "user", profile: { id: "U1", full_name: "Jamie", role: "operator", coffee_access_enabled: true, storefront_tenant_id: null }, storefront: null }
      : { kind: "guest", token: actorState.token },
  toolContextFor: () => ({ threadId: "T", profile: null, storefront: null }),
}));

const clientFactory = vi.fn(() => ({ responses: { create: vi.fn() } }));
vi.mock("./openaiClient", () => ({ getOpenAIClient: () => clientFactory() }));

import { POST as postMessage } from "@/app/api/assistant/threads/[id]/messages/route";
import { GET as getThreads, POST as postThreads } from "@/app/api/assistant/threads/route";
import { createThread, appendUserMessage } from "./threads";

const THREAD_ID = "0d7fe1a2-1c7d-4c1b-9d7f-0d2f0a4b4a11";

function req(url: string, body?: unknown, method = "POST"): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store.assistant_threads = [];
  store.assistant_messages = [];
  clientFactory.mockClear();
  flags.enabled = false;
  actorState.kind = "user";
  process.env.OPENAI_API_KEY = "test";
  process.env.OPENAI_MODEL = "test-model";
  process.env.ASSISTANT_RATE_LIMIT_PER_HOUR = "2";
});

describe("assistant.enabled=false", () => {
  it("returns a 404-style disabled response on every route and never touches OpenAI", async () => {
    const list = await getThreads(req("/api/assistant/threads", undefined, "GET"));
    expect(list.status).toBe(404);
    expect((await list.json()).error.code).toBe("assistant_disabled");
    const create = await postThreads(req("/api/assistant/threads", {}));
    expect(create.status).toBe(404);
    const msg = await postMessage(req(`/api/assistant/threads/${THREAD_ID}/messages`, { content: "hi" }), { params: Promise.resolve({ id: THREAD_ID }) });
    expect(msg.status).toBe(404);
    expect(clientFactory).not.toHaveBeenCalled();
  });
});

describe("assistant.enabled=true", () => {
  beforeEach(() => {
    flags.enabled = true;
  });

  it("rate-limited requests return 429 and do not call OpenAI", async () => {
    const t = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v" });
    await appendUserMessage({ threadId: t.id, content: "a", promptVersion: "v", authorUserId: "U1", networkHash: null });
    await appendUserMessage({ threadId: t.id, content: "b", promptVersion: "v", authorUserId: "U1", networkHash: null });
    const res = await postMessage(req(`/api/assistant/threads/${t.id}/messages`, { content: "third" }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("rate_limited");
    expect(body.error.retry_after_seconds).toBeGreaterThan(0);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(store.assistant_messages.filter((m) => m.content === "third")).toHaveLength(0);
  });

  it("rejects sensitive financial input with 422 before persisting anything", async () => {
    const t = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v" });
    const res = await postMessage(req(`/api/assistant/threads/${t.id}/messages`, { content: "My credit score is 740 and my income is $90,000" }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("sensitive_input_rejected");
    expect(store.assistant_messages).toHaveLength(0);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("returns not_found for a thread the caller does not own, without calling OpenAI", async () => {
    const other = await createThread({ kind: "user", userId: "U2" }, { promptVersion: "v" });
    const res = await postMessage(req(`/api/assistant/threads/${other.id}/messages`, { content: "hi" }), { params: Promise.resolve({ id: other.id }) });
    expect(res.status).toBe(404);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("fails closed with 503 when the model is not configured, after the limits ran", async () => {
    delete process.env.OPENAI_MODEL;
    const t = await createThread({ kind: "user", userId: "U1" }, { promptVersion: "v" });
    const res = await postMessage(req(`/api/assistant/threads/${t.id}/messages`, { content: "hi" }), { params: Promise.resolve({ id: t.id }) });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("configuration_error");
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("issues a hashed guest cookie and reuses the guest's single thread", async () => {
    actorState.kind = "guest";
    actorState.token = "";
    const first = await postThreads(req("/api/assistant/threads", {}));
    expect(first.status).toBe(201);
    const cookie = first.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("vc_asst_guest=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const token = /vc_asst_guest=([a-f0-9]{64})/.exec(cookie)![1];
    expect(JSON.stringify(store.assistant_threads)).not.toContain(token);
    actorState.token = token;
    const again = await postThreads(req("/api/assistant/threads", {}));
    expect(again.status).toBe(200);
    expect((await again.json()).thread.id).toBe((await first.json()).thread.id);
  });
});
