"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reusable debounced autosave hook.
 *
 * Modeled after the working pattern in the website-builder page but
 * lifted into a general-purpose hook so the contractor onboarding
 * flow (and future multi-step forms) don't reinvent it.
 *
 * Usage:
 *   const { queue, flush, saveState } = useDebouncedAutosave({
 *     save: (patch) => fetch(url, { method: "PATCH", body: JSON.stringify(patch) }),
 *     debounceMs: 800,
 *   });
 *   // ...on field change:
 *   queue({ step_data: { fullName: value } });
 *   // ...before advancing step:
 *   await flush();
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Options<TPatch> {
  save: (mergedPatch: TPatch) => Promise<void>;
  debounceMs?: number;
  /** How to merge two patches into one — defaults to shallow spread. */
  merge?: (a: TPatch, b: TPatch) => TPatch;
}

export function useDebouncedAutosave<TPatch extends Record<string, unknown>>(
  opts: Options<TPatch>,
) {
  const { save, debounceMs = 800, merge } = opts;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pendingRef = useRef<TPatch | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const shallowMerge = useCallback(
    (a: TPatch, b: TPatch): TPatch => ({ ...a, ...b }) as TPatch,
    [],
  );
  const mergeFn = merge ?? shallowMerge;

  const doFlush = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    inFlightRef.current = true;
    setSaveState("saving");
    try {
      await save(payload);
      setSaveState("saved");
    } catch (err) {
      console.error("[useDebouncedAutosave] save failed:", err);
      setSaveState("error");
    } finally {
      inFlightRef.current = false;
    }
  }, [save]);

  const queue = useCallback(
    (patch: TPatch): void => {
      pendingRef.current = pendingRef.current
        ? mergeFn(pendingRef.current, patch)
        : patch;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doFlush();
      }, debounceMs);
      setSaveState("saving");
    },
    [debounceMs, doFlush, mergeFn],
  );

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) await doFlush();
  }, [doFlush]);

  // On unmount, best-effort flush so nothing is lost when the
  // component tears down (e.g. navigating away).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) void doFlush();
    };
  }, [doFlush]);

  return { queue, flush, saveState };
}
