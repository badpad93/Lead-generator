"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";

interface TooltipProps {
  /** The text shown on hover / focus. */
  content: string;
  /** Wrapped element (link, button, card, etc.). */
  children: ReactNode;
  /** Preferred placement. Defaults to "bottom". */
  position?: "top" | "bottom";
}

/**
 * Lightweight, accessible tooltip.
 *
 * - Shows on hover (desktop) and focus (keyboard / mobile tap).
 * - Uses `role="tooltip"` + `aria-describedby` for screen-readers.
 * - Pure CSS positioning — no portal, no external deps.
 */
export default function Tooltip({
  content,
  children,
  position = "bottom",
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const idRef = useRef(
    `tooltip-${Math.random().toString(36).slice(2, 9)}`
  );

  const show = useCallback(() => setVisible(true), []);
  const hide = useCallback(() => setVisible(false), []);

  const positionClasses =
    position === "top"
      ? "bottom-full left-1/2 -translate-x-1/2 mb-2"
      : "top-full left-1/2 -translate-x-1/2 mt-2";

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={visible ? idRef.current : undefined}
    >
      {children}

      {visible && (
        <span
          id={idRef.current}
          role="tooltip"
          className={`pointer-events-none absolute z-[60] w-56 rounded-lg bg-black-primary px-3 py-2 text-xs leading-relaxed text-white shadow-lg ${positionClasses}`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
