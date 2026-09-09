"use client";

import { useEffect, useState } from "react";

export const ASSISTANT_STATUS_URL = "/api/assistant/status";

/**
 * Asks the read-only status endpoint whether assistant.enabled is on.
 * Returns null until the answer arrives; a failed or malformed answer
 * counts as off. Purely for showing or hiding the Vinnie option: access
 * to /assistant is still enforced server-side.
 */
export function useVinnieEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(ASSISTANT_STATUS_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data: { enabled?: unknown }) => {
        if (!cancelled) setEnabled(data?.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}
