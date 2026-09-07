"use client";

import { AlertTriangle } from "lucide-react";
import type { UiState } from "./types";

/** Copy per non-idle state. All banners share one monochrome treatment. */
function bannerText(state: UiState): string | null {
  switch (state.kind) {
    case "disabled":
      return "Vinnie is not available right now.";
    case "config_error":
      return "Vinnie is temporarily unavailable. Please try again later.";
    case "rate_limited":
    case "network_error":
    case "rejected":
      return state.message;
    default:
      return null;
  }
}

export function StatusBanner({ state }: { state: UiState }) {
  const text = bannerText(state);
  if (!text) return null;
  return (
    <div role="alert" className="flex items-start gap-2 border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-white">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" aria-hidden />
      <span>{text}</span>
    </div>
  );
}
