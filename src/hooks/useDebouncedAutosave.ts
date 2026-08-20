"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reusable debounced autosave hook.
 *
 * Lifted from the working pattern in the website-builder page so
 * multi-step forms don't reinvent it.
 *
 * Usage:
 *   const { queue, flush, saveState } = useDebouncedAutosave({
 *     save: (patch) => fetch(url, { method: "PATCH", body: JSON.stringify(patch) }),
 *   });
 *   // ...on field change:
 *   queue({ step_data: { fullName: value } });
 *   // ...before advancing step:
 *   await flush();
 *
 * UX design notes
 * ────────────────
 * The visible saveState reflects ONLY actual network activity — it
 * does not flip to "saving" the instant a keystroke is queued. That
 * matters because a typist pressing keys shouldn't see a nervous
 * "Saving…" flash on every character; the indicator should feel
 * ambient. Sequence for a typing burst:
 *
 *   idle/saved → (user types) → indicator unchanged
 *                → (debounceMs pause) → indicator flips to "saving"
 *                → (network resolves ~200ms) → "saved" for savedHoldMs
 *                → back to "idle" so the row goes quiet
 *
 * Default debounce is 1500ms — long enough that a normal typing
 * cadence produces one save per completed thought, not per key.
 */

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Options<TPatch> {
  save: (mergedPatch: TPatch) => Promise<void>;
  /** ms of typing quiet before a save fires. Default 1500. */
  debounceMs?: number;
  /** ms to display "saved" before fading back to idle. Default 2500. */
  savedHoldMs?: number;
  /** How to merge two patches into one — defaults to shallow spread. */
  merge?: (a: TPatch, b: TPatch) => TPatch;
}

export function useDebouncedAutosave<TPatch extends Record<string, unknown>>(
  opts: Options<TPatch>,
) {
  const { save, debounceMs = 1500, savedHoldMs = 2500, merge } = opts;
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const pendingRef = useRef<TPatch | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const shallowMerge = useCallback(
    (a: TPatch, b: TPatch): TPatch => ({ ...a, ...b }) as TPatch,
    [],
  );
  const mergeFn = merge ?? shallowMerge;

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const doFlush = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) return;
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    inFlightRef.current = true;
    clearHold();
    setSaveState("saving");
    try {
      await save(payload);
      setSaveState("saved");
      // Hold "saved" briefly then fade back to idle so the badge
      // doesn't linger visually across the whole form.
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        // Only fade if nothing new happened while we held.
        if (!inFlightRef.current && !pendingRef.current) {
          setSaveState("idle");
        }
      }, savedHoldMs);
    } catch (err) {
      console.error("[useDebouncedAutosave] save failed:", err);
      setSaveState("error");
    } finally {
      inFlightRef.current = false;
    }
  }, [save, savedHoldMs, clearHold]);

  const queue = useCallback(
    (patch: TPatch): void => {
      // Coalesce into the pending payload. Do NOT flip saveState
      // here — keystrokes are inputs, not save events. The indicator
      // reflects actual network activity only.
      pendingRef.current = pendingRef.current
        ? mergeFn(pendingRef.current, patch)
        : patch;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void doFlush();
      }, debounceMs);
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
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (pendingRef.current) void doFlush();
    };
  }, [doFlush]);

  return { queue, flush, saveState };
}
