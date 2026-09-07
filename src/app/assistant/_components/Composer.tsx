"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";

interface Props {
  disabled: boolean;
  /** Initial thread fetch in flight: input locked, but not "unavailable". */
  loading?: boolean;
  streaming: boolean;
  maxLength: number;
  onSend: (text: string) => void;
  onStop: () => void;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";

function placeholderFor(disabled: boolean, loading: boolean): string {
  if (disabled) return "Vinnie is unavailable right now";
  if (loading) return "Connecting to Vinnie…";
  return "Message Vinnie…";
}

export function Composer({ disabled, loading = false, streaming, maxLength, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const locked = disabled || loading;
  const canSend = !locked && !streaming && value.trim().length > 0;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-neutral-700 bg-neutral-900 p-2 focus-within:border-neutral-400" data-testid="assistant-composer">
      <label htmlFor="assistant-input" className="sr-only">Message Vinnie</label>
      <textarea
        id="assistant-input"
        rows={1}
        value={value}
        maxLength={maxLength}
        disabled={locked}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={placeholderFor(disabled, loading)}
        className="max-h-40 min-h-11 flex-1 resize-none !border-0 !bg-transparent !p-2 text-base !text-white !shadow-none placeholder:text-neutral-500 focus:!ring-0 disabled:opacity-50 sm:text-sm"
      />
      {streaming ? (
        <button type="button" onClick={onStop} className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-neutral-600 px-3 text-sm font-medium text-white hover:bg-neutral-800 ${FOCUS}`} aria-label="Stop generating">
          <Square className="h-4 w-4" aria-hidden /> Stop
        </button>
      ) : (
        <button type="submit" disabled={!canSend} className={`flex h-11 w-11 items-center justify-center rounded-xl border border-vinnie-green bg-black text-vinnie-green transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:border-neutral-700 disabled:text-neutral-500 ${FOCUS}`} aria-label="Send message">
          <ArrowUp className="h-5 w-5" aria-hidden />
        </button>
      )}
    </form>
  );
}
