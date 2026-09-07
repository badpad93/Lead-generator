"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/assistant/identity";
import { BlockView } from "./Blocks";
import { VinnieAvatar } from "./VinnieAvatar";
import type { ChatMessage } from "./types";

function Paragraphs({ content }: { content: string }) {
  const parts = content.split(/\n{2,}/).filter((p) => p.trim());
  return (
    <>
      {parts.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap">{p}</p>
      ))}
    </>
  );
}

function UserBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-neutral-800 px-4 py-3 text-[15px] leading-relaxed text-white">
        <Paragraphs content={m.content} />
      </div>
    </div>
  );
}

function AssistantText({ m }: { m: ChatMessage }) {
  if (!m.content && !m.streaming) return null;
  return (
    <div className="space-y-2 text-[15px] leading-relaxed text-white" aria-live={m.streaming ? "polite" : undefined}>
      <Paragraphs content={m.content} />
      {m.streaming && !m.content ? <span className="inline-block h-4 w-2 animate-pulse rounded-sm bg-neutral-400" aria-hidden /> : null}
    </div>
  );
}

function Activity({ label }: { label: string | null | undefined }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-400" role="status">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {label}…
    </div>
  );
}

function AssistantBubble({ m }: { m: ChatMessage }) {
  return (
    <div className="flex gap-3">
      <VinnieAvatar size="sm" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="text-xs font-medium text-neutral-400">{ASSISTANT_NAME}</div>
        <AssistantText m={m} />
        <Activity label={m.activity} />
        {m.blocks.map((b, i) => (
          <BlockView key={`${m.id}-b${i}`} block={b} />
        ))}
        {m.interrupted && !m.streaming ? <p className="text-xs italic text-neutral-400">This response was interrupted.</p> : null}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  return m.role === "user" ? <UserBubble m={m} /> : <AssistantBubble m={m} />;
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastKey = messages.length ? `${messages[messages.length - 1].id}:${messages[messages.length - 1].content.length}` : "";
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastKey]);
  return (
    <div className="space-y-6" role="log" aria-label="Conversation">
      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
