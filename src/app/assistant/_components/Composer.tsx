"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { SendHorizontal, Square } from "lucide-react";

interface Props {
  disabled: boolean;
  streaming: boolean;
  maxLength: number;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function Composer({ disabled, streaming, maxLength, onSend, onStop }: Props) {
  const [value, setValue] = useState("");
  const canSend = !disabled && !streaming && value.trim().length > 0;

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
    <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
      <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
      <textarea
        id="assistant-input"
        rows={1}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKey}
        placeholder={disabled ? "The assistant is unavailable right now" : "Ask about machines, coffee, locations, or your orders…"}
        className="!border-0 !shadow-none max-h-40 min-h-[2.5rem] flex-1 resize-none !bg-transparent !p-2 text-sm focus:!ring-0"
      />
      {streaming ? (
        <button type="button" onClick={onStop} className="flex h-10 items-center gap-1 rounded-xl border border-gray-200 px-3 text-sm font-medium text-black-primary hover:bg-light-warm" aria-label="Stop generating">
          <Square className="h-4 w-4" aria-hidden /> Stop
        </button>
      ) : (
        <button type="submit" disabled={!canSend} className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-primary text-white transition-colors hover:bg-green-hover disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
          <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      )}
    </form>
  );
}
