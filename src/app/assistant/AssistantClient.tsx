"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot } from "lucide-react";
import { Composer } from "./_components/Composer";
import { MessageList } from "./_components/MessageList";
import { StarterQuestions } from "./_components/StarterQuestions";
import { ThreadSidebar } from "./_components/ThreadSidebar";
import { readSseStream } from "./_components/sseClient";
import type { ApiError, ChatMessage, SseEvent, ThreadSummary, UiState, Viewer } from "./_components/types";

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

function stateFromError(status: number, body: ApiError | null): UiState {
  const message = body?.error?.message ?? "Something went wrong. Please try again.";
  const kind = errorKind(status, body?.error?.code);
  return kind === "disabled" ? { kind } : { kind, message };
}

async function readError(res: Response): Promise<UiState> {
  const body = (await res.json().catch(() => null)) as ApiError | null;
  return stateFromError(res.status, body);
}

function StatusBanner({ state }: { state: UiState }) {
  if (state.kind === "disabled") return <Banner tone="gray" text="The assistant is not available right now." />;
  if (state.kind === "rate_limited") return <Banner tone="amber" text={state.message} />;
  if (state.kind === "config_error") return <Banner tone="amber" text="The assistant is temporarily unavailable. Please try again later." />;
  if (state.kind === "network_error") return <Banner tone="red" text={state.message} />;
  if (state.kind === "rejected") return <Banner tone="amber" text={state.message} />;
  return null;
}

function Banner({ tone, text }: { tone: "gray" | "amber" | "red"; text: string }) {
  const cls = { gray: "border-gray-200 bg-gray-50 text-gray-700", amber: "border-amber-200 bg-amber-50 text-amber-800", red: "border-red-200 bg-red-50 text-red-700" }[tone];
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${cls}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {text}
    </div>
  );
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

export default function AssistantClient({ maxMessageLength }: { maxMessageLength: number }) {
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
    const tempUser: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text, blocks: [], interrupted: false, created_at: new Date().toISOString() };
    const draftId = `a-${Date.now()}`;
    const draft: ChatMessage = { id: draftId, role: "assistant", content: "", blocks: [], interrupted: false, created_at: new Date().toISOString(), streaming: true, activity: null };
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
        setMessages((prev) => prev.filter((m) => m.id !== draftId && m.id !== tempUser.id));
        setState(next);
        return;
      }
      await readSseStream(res.body, (ev) => setMessages((prev) => applyEvent(prev, ev, draftId)), abort.signal);
      setState({ kind: "idle" });
      void refreshThreads();
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setMessages((prev) => prev.map((m) => (m.id === draftId ? { ...m, streaming: false, activity: null, interrupted: true } : m)));
      setState(aborted ? { kind: "idle" } : { kind: "network_error", message: "Connection lost. Please try again." });
    } finally {
      abortRef.current = null;
    }
  }, [activeId, ensureThread, refreshThreads]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const busy = state.kind === "loading" || state.kind === "streaming";
  const disabled = state.kind === "disabled" || state.kind === "config_error";

  return (
    <div className="min-h-[calc(100vh-160px)] bg-light">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[240px_1fr] lg:px-8">
        <div className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)]">
          <ThreadSidebar viewer={viewer} threads={threads} activeId={activeId} onSelect={(id) => void loadThread(id)} onNew={() => void ensureThread(true)} disabled={busy || disabled} />
        </div>
        <section className="flex min-h-[70vh] flex-col gap-4" aria-label="Assistant">
          <header className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 text-green-primary">
              <Bot className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-black-primary">Vending Connector Assistant</h1>
              <p className="text-xs text-gray-500">Machines, coffee, locations, and your orders. Read-only: it can look things up, not buy or change anything.</p>
            </div>
          </header>
          <StatusBanner state={state} />
          <div className="flex-1 rounded-2xl border border-gray-200 bg-light-warm p-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">Ask anything about vending or the Vending Connector catalog. Try one of these:</p>
                <StarterQuestions onPick={(q) => void send(q)} disabled={busy || disabled} />
              </div>
            ) : (
              <MessageList messages={messages} />
            )}
          </div>
          <Composer disabled={disabled || state.kind === "loading"} streaming={state.kind === "streaming"} maxLength={maxMessageLength} onSend={(t) => void send(t)} onStop={stop} />
          <p className="text-[11px] text-gray-400">Do not share card, bank, Social Security, credit, or income details here. Prices shown come from the live catalog for your account.</p>
        </section>
      </div>
    </div>
  );
}
