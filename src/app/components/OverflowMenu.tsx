"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

/**
 * A small "More" overflow menu for rare / destructive actions, so they
 * don't visually compete with the primary workflow buttons. Closes on
 * outside click or when a menu item is chosen.
 */
export default function OverflowMenu({
  children,
  label = "More",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 cursor-pointer inline-flex items-center justify-center gap-2"
      >
        <MoreHorizontal className="h-4 w-4" /> {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg p-1 space-y-1"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
