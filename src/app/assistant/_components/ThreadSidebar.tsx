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

export function ThreadSidebar({ viewer, threads, activeId, onSelect, onNew, disabled }: Props) {
  return (
    <aside className="flex h-full flex-col gap-3" aria-label="Conversations">
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="flex items-center justify-center gap-2 rounded-xl bg-green-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-hover disabled:opacity-50"
      >
        <Plus className="h-4 w-4" aria-hidden /> New conversation
      </button>
      {viewer === "user" ? (
        <nav className="flex-1 space-y-1 overflow-y-auto">
          {threads.length === 0 ? <p className="px-2 text-xs text-gray-500">No conversations yet.</p> : null}
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={t.id === activeId ? "true" : undefined}
              className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${t.id === activeId ? "bg-green-50 text-green-dark" : "text-gray-700 hover:bg-light-warm"}`}
            >
              <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="line-clamp-2">{t.title ?? "Untitled conversation"}</span>
            </button>
          ))}
        </nav>
      ) : (
        <p className="px-2 text-xs text-gray-500">
          Guest conversations are kept on this device. Sign in to keep a history and check your orders.
        </p>
      )}
    </aside>
  );
}
