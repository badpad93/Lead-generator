"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSseStream } from "./sseClient";
import type { ApiError, ChatMessage, SseEvent, ThreadSummary, UiState, Viewer } from "./types";

/**
 * All conversation state and networking for the assistant page. The API
 * contract (threads, guest cookie, SSE v1) is unchanged from Phase 1; this
 * hook only separates behavior from the full-screen presentation layer.
 */
const API = "/api/assistant/threads";

type ErrorKind = "disabled" | "rate_limited" | "config_error" | "rejected" | "network_error";
const STATE_BY_STATUS: Record<number, ErrorKind> = { 404: "disabled", 429: "rate_limited", 503: "config_error", 422: "rejected" };
const STATE_BY_CODE: Record<string, ErrorKind> = {
  assistant_disabled: "disabled",
  rate_limited: "rate_limited",
  configuration_error: "config_error",
  sensitive_input_rejected: "rejected",
};

function errorKind(status: number, code: string | undefined): ErrorKind {
  if (code && code in STATE_BY_CODE) return STATE_BY_CODE[code];
  return STATE_BY_STATUS[status] ?? "network_error";
}

export function stateFromError(status: number, body: ApiError | null): UiState {
  const message = body?.error?.message ?? "Something went wrong. Please try again.";
  const kind = errorKind(status, body?.error?.code);
  return kind === "disabled" ? { kind } : { kind, message };
}

async function readError(res: Response): Promise<UiState> {
  const body = (await res.json().catch(() => null)) as ApiError | null;
  return stateFromError(res.status, body);
}

function applyEvent(prev: ChatMessage[], ev: SseEvent, draftId: string): ChatMessage[] {
  return prev.map((m) => (m.id === draftId ? applyToDraft(m, ev) : m));
}

function applyProgress(m: ChatMessage, ev: SseEvent): ChatMessage | null {
  if (ev.type === "text_delta") return { ...m, content: m.content + ev.delta };
  if (ev.type === "tool_started") return { ...m, activity: ev.label };
  if (ev.type === "tool_completed") return { ...m, activity: null };
  if (ev.type === "block") return { ...m, blocks: [...m.blocks, ev.block] };
  return null;
}

function applyTerminal(m: ChatMessage, ev: SseEvent): ChatMessage {
  if (ev.type === "response_completed") return { ...m, id: ev.message_id, streaming: false, activity: null };
  if (ev.type === "response_interrupted") return { ...m, id: ev.message_id ?? m.id, streaming: false, interrupted: true, activity: null };
  if (ev.type === "error") return { ...m, streaming: false, activity: null, interrupted: true, content: m.content || ev.message };
  return m;
}

function applyToDraft(m: ChatMessage, ev: SseEvent): ChatMessage {
  return applyProgress(m, ev) ?? applyTerminal(m, ev);
}

function draftPair(text: string): { tempUser: ChatMessage; draft: ChatMessage } {
  const now = new Date().toISOString();
  const tempUser: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, blocks: [], interrupted: false, created_at: now };
  const draft: ChatMessage = { id: `a-${Date.now()}`, role: "assistant", content: "", blocks: [], interrupted: false, created_at: now, streaming: true, activity: null };
  return { tempUser, draft };
}

export interface AssistantChat {
  viewer: Viewer;
  threads: ThreadSummary[];
  activeId: string | null;
  messages: ChatMessage[];
  state: UiState;
  busy: boolean;
  disabled: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  loadThread: (id: string) => Promise<void>;
  newThread: () => Promise<string | null>;
}

export function useAssistantChat(): AssistantChat {
  const [viewer, setViewer] = useState<Viewer>("anonymous");
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<UiState>({ kind: "loading" });
  const abortRef = useRef<AbortController | null>(null);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`${API}/${id}`, { cache: "no-store" });
    if (!res.ok) {
      setState(await readError(res));
      return;
    }
    const data = (await res.json()) as { messages: ChatMessage[] };
    setActiveId(id);
    setMessages(data.messages.map((m) => ({ ...m, blocks: m.blocks ?? [] })));
    setState({ kind: "idle" });
  }, []);

  const refreshThreads = useCallback(async (): Promise<{ viewer: Viewer; threads: ThreadSummary[] } | null> => {
    const res = await fetch(API, { cache: "no-store" });
    if (!res.ok) {
      setState(await readError(res));
      return null;
    }
    const data = (await res.json()) as { viewer: Viewer; threads: ThreadSummary[] };
    setViewer(data.viewer);
    setThreads(data.threads);
    return data;
  }, []);

  const ensureThread = useCallback(async (fresh: boolean): Promise<string | null> => {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_conversation: fresh }) });
    if (!res.ok) {
      setState(await readError(res));
      return null;
    }
    const data = (await res.json()) as { thread: ThreadSummary };
    await refreshThreads();
    setActiveId(data.thread.id);
    setMessages([]);
    setState({ kind: "idle" });
    return data.thread.id;
  }, [refreshThreads]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await refreshThreads();
      if (cancelled || !data) return;
      const first = data.threads.find((t) => t.status === "open");
      if (first) await loadThread(first.id);
      else setState({ kind: "idle" });
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshThreads, loadThread]);

  const send = useCallback(async (text: string) => {
    const threadId = activeId ?? (await ensureThread(false));
    if (!threadId) return;
    const { tempUser, draft } = draftPair(text);
    setMessages((prev) => [...prev, tempUser, draft]);
    setState({ kind: "streaming" });
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await fetch(`${API}/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        const next = await readError(res);
        setMessages((prev) => prev.filter((m) => m.id !== draft.id && m.id !== tempUser.id));
        setState(next);
        return;
      }
      await readSseStream(res.body, (ev) => setMessages((prev) => applyEvent(prev, ev, draft.id)), abort.signal);
      setState({ kind: "idle" });
      void refreshThreads();
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setMessages((prev) => prev.map((m) => (m.id === draft.id ? { ...m, streaming: false, activity: null, interrupted: true } : m)));
      setState(aborted ? { kind: "idle" } : { kind: "network_error", message: "Connection lost. Please try again." });
    } finally {
      abortRef.current = null;
    }
  }, [activeId, ensureThread, refreshThreads]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const newThread = useCallback(() => ensureThread(true), [ensureThread]);
  const busy = state.kind === "loading" || state.kind === "streaming";
  const disabled = state.kind === "disabled" || state.kind === "config_error";

  return { viewer, threads, activeId, messages, state, busy, disabled, send, stop, loadThread, newThread };
}
