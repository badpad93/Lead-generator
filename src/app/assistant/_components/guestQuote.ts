/**
 * Guest quote: a temporary, browser-local list of catalog refs. Guests
 * see the public prices the catalog cards showed them, but nothing is
 * saved server-side, priced for an account, emailed, financed, or
 * checked out until they sign in — at which point the list is replayed
 * through the authenticated operations route and cleared.
 */
export const GUEST_QUOTE_KEY = "vinnie_guest_quote_v1";

export interface GuestLine {
  ref: string;
  name: string;
  quantity: number;
  /** Public unit price shown on the card, or null when there is no catalog charge. */
  unit_price: number | null;
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readGuestQuote(s: Storage | null = storage()): GuestLine[] {
  try {
    const raw = s?.getItem(GUEST_QUOTE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter(isGuestLine).slice(0, 25) : [];
  } catch {
    return [];
  }
}

function isGuestLine(v: unknown): v is GuestLine {
  const l = v as GuestLine;
  return !!l && typeof l.ref === "string" && typeof l.name === "string" && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 999;
}

const CHANGE_EVENT = "vinnie-guest-quote-changed";

export function writeGuestQuote(lines: GuestLine[], s: Storage | null = storage()): void {
  try {
    if (lines.length === 0) s?.removeItem(GUEST_QUOTE_KEY);
    else s?.setItem(GUEST_QUOTE_KEY, JSON.stringify(lines.slice(0, 25)));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* storage unavailable */
  }
}

const EMPTY: GuestLine[] = [];
let snapshot: { raw: string | null; lines: GuestLine[] } = { raw: null, lines: EMPTY };

/** Stable-identity snapshot for useSyncExternalStore (same raw string → same array). */
export function getGuestQuoteSnapshot(): GuestLine[] {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(GUEST_QUOTE_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== snapshot.raw) snapshot = { raw, lines: raw ? readGuestQuote() : EMPTY };
  return snapshot.lines;
}

export function getGuestQuoteServerSnapshot(): GuestLine[] {
  return EMPTY;
}

export function subscribeGuestQuote(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function upsertGuestLine(lines: GuestLine[], line: GuestLine): GuestLine[] {
  const existing = lines.find((l) => l.ref === line.ref);
  if (!existing) return [...lines, { ...line, quantity: Math.min(line.quantity, 999) }];
  return lines.map((l) => (l.ref === line.ref ? { ...l, quantity: Math.min(l.quantity + line.quantity, 999) } : l));
}

export function setGuestQuantity(lines: GuestLine[], ref: string, quantity: number): GuestLine[] {
  if (quantity < 1) return lines.filter((l) => l.ref !== ref);
  return lines.map((l) => (l.ref === ref ? { ...l, quantity: Math.min(quantity, 999) } : l));
}

export function guestSubtotal(lines: GuestLine[]): number {
  return Math.round(lines.reduce((n, l) => n + (l.unit_price ?? 0) * l.quantity, 0) * 100) / 100;
}
