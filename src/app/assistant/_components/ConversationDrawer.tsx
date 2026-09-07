"use client";

import { useEffect, type PropsWithChildren } from "react";
import { X } from "lucide-react";

type Props = PropsWithChildren<{
  open: boolean;
  onClose: () => void;
}>;

/**
 * Mobile-only slide-over holding the conversation history. Escape and the
 * backdrop both close it; the panel is a modal dialog for assistive tech.
 */
export function ConversationDrawer({ open, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 lg:hidden" data-testid="conversation-drawer">
      <button type="button" aria-label="Close conversations" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div role="dialog" aria-modal="true" aria-label="Conversations" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-neutral-800 bg-neutral-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
        <div className="flex items-center justify-between px-3 pt-3">
          <span className="text-sm font-semibold">Conversations</span>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
