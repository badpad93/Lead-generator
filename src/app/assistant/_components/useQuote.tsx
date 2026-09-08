"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { getGuestQuoteServerSnapshot, getGuestQuoteSnapshot, guestSubtotal, readGuestQuote, setGuestQuantity, subscribeGuestQuote, upsertGuestLine, writeGuestQuote, type GuestLine } from "./guestQuote";
import type { QuoteFlags, QuoteView, Viewer } from "./types";

/**
 * Quote state for the whole assistant page. Signed-in customers read and
 * mutate the server quote through /api/assistant/quote*; guests keep a
 * browser-local list that is replayed to the server after sign-in.
 * Prices in the guest list are display-only; the server reprices on
 * replay and again before confirmation and checkout.
 */
const API = "/api/assistant/quote";

export interface QuoteApi {
  viewer: Viewer;
  view: QuoteView | null;
  payUrl: string | null;
  flags: QuoteFlags;
  guestLines: GuestLine[];
  busy: boolean;
  error: string | null;
  open: boolean;
  lineCount: number;
  setOpen: (open: boolean) => void;
  addItem: (line: GuestLine) => Promise<void>;
  setQuantity: (ref: string, quantity: number) => Promise<void>;
  removeItem: (ref: string) => Promise<void>;
  confirm: () => Promise<void>;
  checkout: () => Promise<void>;
  financing: (program: "standard" | "ten_ten_ten") => Promise<string | null>;
  requestInfo: (listingId: string) => Promise<string | null>;
  emailQuote: () => Promise<string | null>;
  /** Owner-initiated, read-only payment status check for an invoiced quote. */
  checkStatus: () => Promise<string | null>;
  refresh: () => Promise<void>;
}

const QuoteContext = createContext<QuoteApi | null>(null);

export function useQuoteApi(): QuoteApi {
  const api = useContext(QuoteContext);
  if (!api) throw new Error("QuoteProvider missing");
  return api;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; code: string };

type ErrorBody = { error?: { code?: string; message?: string } } | null;

function failure(json: ErrorBody): ApiResult<never> {
  return { ok: false, code: json?.error?.code ?? "error", message: json?.error?.message ?? "Something went wrong." };
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    const json = (await res.json().catch(() => null)) as (T & ErrorBody) | null;
    return res.ok ? { ok: true, data: json as T } : failure(json);
  } catch {
    return { ok: false, code: "network_error", message: "Connection lost. Please try again." };
  }
}

interface QuoteResponse {
  quote: QuoteView | null;
  pay_url?: string | null;
  flags?: QuoteFlags;
  outcome?: string;
  checkout?: QuoteView["checkout"];
}

const DEFAULT_FLAGS: QuoteFlags = { write_tools_enabled: false, checkout_enabled: false };

function useServerQuote(viewer: Viewer, initialFlags: QuoteFlags) {
  const [view, setView] = useState<QuoteView | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [flags, setFlags] = useState<QuoteFlags>(initialFlags);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const absorb = useCallback((r: ApiResult<QuoteResponse>) => {
    if (!r.ok) {
      setError(r.message);
      return r;
    }
    setError(null);
    if (r.data.quote !== undefined) setView(r.data.quote);
    if (r.data.pay_url !== undefined) setPayUrl(r.data.pay_url ?? null);
    if (r.data.flags) setFlags(r.data.flags);
    return r;
  }, []);

  const run = useCallback(async (path: string, body?: unknown): Promise<ApiResult<QuoteResponse>> => {
    setBusy(true);
    try {
      return absorb(await call<QuoteResponse>(path, body === undefined ? undefined : { method: "POST", body: JSON.stringify(body) }));
    } finally {
      setBusy(false);
    }
  }, [absorb]);

  const refresh = useCallback(async () => {
    if (viewer !== "user") return;
    await run(API);
  }, [run, viewer]);

  return { view, payUrl, flags, busy, error, setError, run, refresh, setPayUrl };
}

export function QuoteProvider({ viewer, flags: initialFlags = DEFAULT_FLAGS, children }: { viewer: Viewer; flags?: QuoteFlags; children: ReactNode }) {
  const server = useServerQuote(viewer, initialFlags);
  const guestLines = useSyncExternalStore(subscribeGuestQuote, getGuestQuoteSnapshot, getGuestQuoteServerSnapshot);
  const [open, setOpen] = useState(false);
  const { run, refresh, setError, setPayUrl } = server;

  // Signed-in customer with a guest list: replay it through the server once, then clear it.
  useEffect(() => {
    if (viewer !== "user") return;
    const pending = readGuestQuote();
    (async () => {
      if (pending.length > 0) {
        const r = await run(`${API}/operations`, { operations: pending.map((l) => ({ op: "add", ref: l.ref, quantity: l.quantity })) });
        if (r.ok || r.code === "write_tools_disabled") writeGuestQuote([]);
      }
      await refresh();
    })();
  }, [viewer, run, refresh]);

  const updateGuest = useCallback((next: GuestLine[]) => writeGuestQuote(next), []);

  const ops = useCallback(async (operations: Array<{ op: "add" | "remove" | "set_quantity"; ref: string; quantity: number | null }>) => {
    await run(`${API}/operations`, { operations });
  }, [run]);

  const addItem = useCallback(async (line: GuestLine) => {
    setOpen(true);
    if (viewer !== "user") return updateGuest(upsertGuestLine(guestLines, line));
    await ops([{ op: "add", ref: line.ref, quantity: line.quantity }]);
  }, [viewer, guestLines, updateGuest, ops]);

  const setQuantity = useCallback(async (ref: string, quantity: number) => {
    if (viewer !== "user") return updateGuest(setGuestQuantity(guestLines, ref, quantity));
    await ops([quantity < 1 ? { op: "remove", ref, quantity: null } : { op: "set_quantity", ref, quantity }]);
  }, [viewer, guestLines, updateGuest, ops]);

  const removeItem = useCallback((ref: string) => setQuantity(ref, 0), [setQuantity]);

  const confirm = useCallback(async () => {
    if (!server.view) return;
    await run(`${API}/confirm`, { quote_id: server.view.quote_id, version: server.view.version });
  }, [run, server.view]);

  const checkout = useCallback(async () => {
    if (!server.view) return;
    const r = await run(`${API}/checkout`, { quote_id: server.view.quote_id, version: server.view.version, confirm: true });
    if (!r.ok && r.code !== "checkout_blocked") return;
    if (r.ok && r.data.outcome === "invoiced" && r.data.pay_url) setPayUrl(r.data.pay_url);
  }, [run, server.view, setPayUrl]);

  const financing = useCallback(async (program: "standard" | "ten_ten_ten") => {
    if (!server.view) return null;
    const r = await call<{ financing_url: string }>(`${API}/financing-interest`, { method: "POST", body: JSON.stringify({ quote_id: server.view.quote_id, program }) });
    if (!r.ok) {
      setError(r.message);
      return null;
    }
    await refresh();
    return r.data.financing_url;
  }, [server.view, refresh, setError]);

  const requestInfo = useCallback(async (listingId: string) => {
    const r = await call<{ notice: string }>("/api/assistant/listing-inquiry", { method: "POST", body: JSON.stringify({ machine_listing_id: listingId, message: null, thread_id: null }) });
    if (!r.ok) {
      setError(r.message);
      return null;
    }
    return r.data.notice;
  }, [setError]);

  const emailQuote = useCallback(async () => {
    if (!server.view) return null;
    const r = await call<{ sent_to: string }>(`${API}/email`, { method: "POST", body: JSON.stringify({ quote_id: server.view.quote_id }) });
    if (!r.ok) {
      setError(r.message);
      return null;
    }
    return r.data.sent_to;
  }, [server.view, setError]);

  const checkStatus = useCallback(async () => {
    if (!server.view) return null;
    const r = await run(`${API}/status`, { quote_id: server.view.quote_id });
    if (!r.ok) return null;
    return typeof r.data.outcome === "string" ? r.data.outcome : null;
  }, [run, server.view]);

  const lineCount = viewer === "user" ? (server.view?.lines.length ?? 0) : guestLines.length;
  const value = useMemo<QuoteApi>(
    () => ({ viewer, view: server.view, payUrl: server.payUrl, flags: server.flags, guestLines, busy: server.busy, error: server.error, open, lineCount, setOpen, addItem, setQuantity, removeItem, confirm, checkout, financing, requestInfo, emailQuote, checkStatus, refresh }),
    [viewer, server.view, server.payUrl, server.flags, guestLines, server.busy, server.error, open, lineCount, addItem, setQuantity, removeItem, confirm, checkout, financing, requestInfo, emailQuote, checkStatus, refresh],
  );
  return <QuoteContext.Provider value={value}>{children}</QuoteContext.Provider>;
}

export { guestSubtotal };
