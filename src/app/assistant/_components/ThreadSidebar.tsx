"use client";

import { MessageSquare, Plus } from "lucide-react";
import type { ThreadSummary, Viewer } from "./types";

interface Props {
  viewer: Viewer;
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  disabled: boolean;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";

function ThreadButton({ t, active, onSelect }: { t: ThreadSummary; active: boolean; onSelect: (id: string) => void }) {
  const tone = active ? "bg-neutral-800 text-white" : "text-neutral-300 hover:bg-neutral-900 hover:text-white";
  return (
    <button
      type="button"
      onClick={() => onSelect(t.id)}
      aria-current={active ? "true" : undefined}
      className={`flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${tone} ${FOCUS}`}
    >
      <MessageSquare className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-vinnie-green" : ""}`} aria-hidden />
      <span className="line-clamp-2">{t.title ?? "Untitled conversation"}</span>
    </button>
  );
}

/** Conversation history. Rendered inside the desktop sidebar and the mobile drawer. */
export function ThreadSidebar({ viewer, threads, activeId, onSelect, onNew, disabled }: Props) {
  return (
    <div className="flex h-full flex-col gap-3 p-3" data-testid="thread-sidebar">
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-neutral-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
      >
        <Plus className="h-4 w-4" aria-hidden /> New conversation
      </button>
      {viewer === "user" ? (
        <nav className="flex-1 space-y-1 overflow-y-auto" aria-label="Conversation history">
          {threads.length === 0 ? <p className="px-3 text-sm text-neutral-400">No conversations yet.</p> : null}
          {threads.map((t) => (
            <ThreadButton key={t.id} t={t} active={t.id === activeId} onSelect={onSelect} />
          ))}
        </nav>
      ) : (
        <p className="px-3 text-sm text-neutral-400">Guest conversations are kept on this device. Sign in to keep a history and check your orders.</p>
      )}
    </div>
  );
}
