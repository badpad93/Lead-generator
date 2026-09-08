"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, FileText, Mail, Minus, Plus, Trash2, X } from "lucide-react";
import { formatUsd } from "@/lib/assistant/publicShapes";
import { guestSubtotal, useQuoteApi } from "./useQuote";
import type { QuoteLineView, QuoteView } from "./types";

/**
 * Quote / cart drawer. Every number shown comes from the server view
 * (or, for guests, the public card price with an explicit "sign in to
 * price" notice). Checkout is a physical click on an authenticated route
 * and appears only when the server says it is available.
 */
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black";
const BTN = `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;
const PRIMARY = `${BTN} border-vinnie-green bg-black text-vinnie-green hover:bg-neutral-900`;
const SECONDARY = `${BTN} border-neutral-600 text-white hover:bg-neutral-800`;
const ICON = `flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-700 text-white hover:bg-neutral-800 disabled:opacity-40 ${FOCUS}`;

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

function QuantityControls({ line, editing }: { line: QuoteLineView; editing: boolean }) {
  const api = useQuoteApi();
  if (line.is_auto_add_on) return <span className="text-xs text-neutral-400">× {line.quantity} (automatic)</span>;
  if (!editing) return <span className="text-xs text-neutral-400">× {line.quantity}</span>;
  return (
    <div className="flex items-center gap-1" aria-label={`Quantity for ${line.description}`}>
      <button type="button" className={ICON} aria-label="Decrease quantity" disabled={api.busy} onClick={() => void api.setQuantity(line.ref, line.quantity - 1)}><Minus className="h-4 w-4" aria-hidden /></button>
      <span className="w-8 text-center text-sm text-white" aria-live="polite">{line.quantity}</span>
      <button type="button" className={ICON} aria-label="Increase quantity" disabled={api.busy} onClick={() => void api.setQuantity(line.ref, line.quantity + 1)}><Plus className="h-4 w-4" aria-hidden /></button>
      <button type="button" className={ICON} aria-label={`Remove ${line.description}`} disabled={api.busy} onClick={() => void api.removeItem(line.ref)}><Trash2 className="h-4 w-4" aria-hidden /></button>
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  requires_qualification: "Awaiting staff determination",
  location_intake: "Deposit via location request",
  inactive: "No longer available",
  unavailable: "Unavailable",
  price_changed: "Price changed",
};

function LineRow({ line, editing }: { line: QuoteLineView; editing: boolean }) {
  const flag = STATUS_TEXT[line.validation_status];
  return (
    <li className={`rounded-xl border border-neutral-800 bg-neutral-900 p-3 ${line.is_auto_add_on ? "ml-4" : ""}`} data-testid="quote-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{line.description}</p>
          <p className="text-xs text-neutral-400">{formatUsd(line.unit_price)} each{line.pricing_basis === "catalog_per_location" ? " · per location" : ""}</p>
          {flag ? <p className="mt-1 text-xs text-neutral-300">{flag}</p> : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-sm font-semibold text-white">{formatUsd(line.line_total)}</span>
          <QuantityControls line={line} editing={editing} />
        </div>
      </div>
    </li>
  );
}

function Changes({ view }: { view: QuoteView }) {
  if (view.changes.length === 0) return null;
  return (
    <div role="alert" className="rounded-xl border border-neutral-600 bg-neutral-900 p-3 text-sm text-white" data-testid="quote-changes">
      <p className="font-semibold">Something changed since you last confirmed:</p>
      <ul className="mt-1 list-disc pl-5 text-neutral-200">
        {view.changes.map((c, i) => (
          <li key={i}>{c.description}: {c.kind.replace(/_/g, " ")}{c.previous !== null && c.current !== null ? ` (${formatUsd(c.previous)} → ${formatUsd(c.current)})` : ""}</li>
        ))}
      </ul>
      <p className="mt-1 text-neutral-300">Please review and confirm again.</p>
    </div>
  );
}

function Totals({ view }: { view: QuoteView }) {
  return (
    <div className="space-y-1 border-t border-neutral-800 pt-3 text-sm">
      <div className="flex justify-between text-neutral-300"><span>Subtotal (pre-tax)</span><span>{formatUsd(view.subtotal)}</span></div>
      <div className="flex justify-between text-base font-semibold text-white"><span>Total before tax</span><span>{formatUsd(view.total)}</span></div>
      <p className="text-xs text-neutral-400">{view.tax_note}</p>
      {view.expires_at ? <p className="text-xs text-neutral-400">Confirmed prices valid until {fmtDate(view.expires_at)}.</p> : null}
    </div>
  );
}

function Financing({ view }: { view: QuoteView }) {
  const api = useQuoteApi();
  const [program, setProgram] = useState<"standard" | "ten_ten_ten">(view.financing.program ?? "standard");
  const start = async () => {
    const url = await api.financing(program);
    if (url) window.location.assign(url);
  };
  return (
    <div className="space-y-2 rounded-xl border border-neutral-800 p-3" data-testid="quote-financing">
      <p className="text-sm font-semibold text-white">Financing</p>
      <p className="text-xs text-neutral-400">Interest is recorded on the quote. It is an application, not an approval, rate, term, or discount, and it never reduces the amount due.</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Financing program" value={program} onChange={(e) => setProgram(e.target.value as "standard" | "ten_ten_ten")} className="!w-auto !rounded-lg !border-neutral-700 !bg-neutral-900 !text-sm !text-white">
          <option value="standard">Standard financing</option>
          <option value="ten_ten_ten">10/10/10 program</option>
        </select>
        <button type="button" className={SECONDARY} disabled={api.busy || !api.flags.write_tools_enabled} onClick={() => void start()}>
          <FileText className="h-4 w-4" aria-hidden /> Start financing application
        </button>
      </div>
      {view.financing.status !== "none" ? <p className="text-xs text-vinnie-green">Interest recorded ({view.financing.program === "ten_ten_ten" ? "10/10/10" : "standard"}).</p> : null}
    </div>
  );
}

function PayLink() {
  const api = useQuoteApi();
  if (!api.payUrl) return null;
  return (
    <a href={api.payUrl} target="_blank" rel="noopener noreferrer" className={`${PRIMARY} w-full`} data-testid="pay-with-quickbooks">
      <CreditCard className="h-4 w-4" aria-hidden /> Pay securely with QuickBooks <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  );
}

const PAYMENT_STATUS_TEXT: Record<string, string> = {
  paid: "Payment received. Thank you.",
  unpaid: "Not paid yet. The QuickBooks link above stays open.",
  throttled: "Checked a moment ago. Try again in a minute.",
  unavailable: "Status checks are only available on the production site.",
  not_applicable: "Nothing to check yet.",
};

function StatusCheck({ view }: { view: QuoteView }) {
  const api = useQuoteApi();
  const [note, setNote] = useState<string | null>(null);
  if (view.status !== "invoiced") return null;
  return (
    <>
      <button type="button" className={`${SECONDARY} w-full`} disabled={api.busy} onClick={async () => setNote(PAYMENT_STATUS_TEXT[(await api.checkStatus()) ?? ""] ?? null)} data-testid="check-payment-status">
        <FileText className="h-4 w-4" aria-hidden /> Check payment status
      </button>
      {note ? <p className="text-xs text-neutral-300">{note}</p> : null}
    </>
  );
}

function PrimaryActions({ view }: { view: QuoteView }) {
  const api = useQuoteApi();
  const canConfirm = api.flags.write_tools_enabled && view.status === "draft" && view.lines.length > 0 && view.changes.length === 0;
  const showCheckout = api.flags.checkout_enabled && view.checkout.available && view.status === "confirmed";
  return (
    <>
      {canConfirm ? <button type="button" className={`${PRIMARY} w-full`} disabled={api.busy} onClick={() => void api.confirm()}>Confirm quote</button> : null}
      {showCheckout ? (
        <button type="button" className={`${PRIMARY} w-full`} disabled={api.busy} onClick={() => void api.checkout()} data-testid="checkout-securely">
          <CreditCard className="h-4 w-4" aria-hidden /> Checkout Securely
        </button>
      ) : null}
    </>
  );
}

function LocationIntake({ quantity }: { quantity: number }) {
  if (quantity <= 0) return null;
  return <a href={`/request-location?locations=${quantity}`} className={`${SECONDARY} w-full`}>Continue location request ({quantity} location{quantity > 1 ? "s" : ""})</a>;
}

function EmailButton({ view }: { view: QuoteView }) {
  const api = useQuoteApi();
  const [emailed, setEmailed] = useState<string | null>(null);
  if (view.status !== "confirmed" && view.status !== "invoiced") return null;
  return (
    <>
      <button type="button" className={`${SECONDARY} w-full`} disabled={api.busy} onClick={async () => setEmailed(await api.emailQuote())}>
        <Mail className="h-4 w-4" aria-hidden /> Email Quote
      </button>
      {emailed ? <p className="text-xs text-vinnie-green">Quote emailed to {emailed}.</p> : null}
    </>
  );
}

function Blockers({ view }: { view: QuoteView }) {
  const api = useQuoteApi();
  const reasons = view.checkout.blocked_reasons.filter((r) => r.code !== "checkout_disabled" && r.code !== "not_confirmed");
  return (
    <>
      {!api.flags.checkout_enabled ? <p className="text-xs text-neutral-400">Checkout is not available yet. Your quote is saved.</p> : null}
      {reasons.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-neutral-300" data-testid="checkout-blockers">
          {reasons.map((r, i) => <li key={i}>{r.message}</li>)}
        </ul>
      ) : null}
    </>
  );
}

function CheckoutSection({ view }: { view: QuoteView }) {
  return (
    <div className="space-y-2" data-testid="quote-actions">
      <PayLink />
      <StatusCheck view={view} />
      <PrimaryActions view={view} />
      <LocationIntake quantity={view.checkout.location_intake_quantity} />
      <EmailButton view={view} />
      <Blockers view={view} />
    </div>
  );
}

function GuestBody() {
  const api = useQuoteApi();
  return (
    <div className="space-y-3" data-testid="guest-quote">
      <p className="text-sm text-neutral-300">Items you picked are kept on this device. <a href="/login?redirect=/assistant" className={`text-vinnie-green underline ${FOCUS}`}>Sign in</a> to price them for your account, save the quote, email it, or check out.</p>
      {api.guestLines.length === 0 ? <p className="text-sm text-neutral-400">No items yet.</p> : null}
      <ul className="space-y-2">
        {api.guestLines.map((l) => (
          <li key={l.ref} className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-sm">
            <div><p className="text-white">{l.name}</p><p className="text-xs text-neutral-400">{l.unit_price === null ? "No catalog charge" : `${formatUsd(l.unit_price)} each · public price`}</p></div>
            <div className="flex items-center gap-1">
              <button type="button" className={ICON} aria-label="Decrease quantity" onClick={() => void api.setQuantity(l.ref, l.quantity - 1)}><Minus className="h-4 w-4" aria-hidden /></button>
              <span className="w-8 text-center text-white">{l.quantity}</span>
              <button type="button" className={ICON} aria-label="Increase quantity" onClick={() => void api.setQuantity(l.ref, l.quantity + 1)}><Plus className="h-4 w-4" aria-hidden /></button>
            </div>
          </li>
        ))}
      </ul>
      {api.guestLines.length > 0 ? <p className="text-sm text-white">Estimated subtotal (public prices, pre-tax): {formatUsd(guestSubtotal(api.guestLines))}</p> : null}
    </div>
  );
}

function UserBody({ view, editing }: { view: QuoteView | null; editing: boolean }) {
  if (!view || view.lines.length === 0) return <p className="text-sm text-neutral-400">Your quote is empty. Add items from the catalog cards or ask Vinnie to add them.</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-400">Quote {view.quote_number} · v{view.version} · {view.status}</p>
      <Changes view={view} />
      <ul className="space-y-2">{view.lines.map((l) => <LineRow key={l.line_id} line={l} editing={editing} />)}</ul>
      {view.notices.length > 0 ? <ul className="list-disc pl-5 text-xs text-neutral-300">{view.notices.map((n, i) => <li key={i}>{n}</li>)}</ul> : null}
      <Totals view={view} />
      <Financing view={view} />
      <CheckoutSection view={view} />
    </div>
  );
}

function DrawerHeader({ editable, editing, onToggle }: { editable: boolean; editing: boolean; onToggle: () => void }) {
  const api = useQuoteApi();
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
      <h2 className="text-base font-semibold">Your quote</h2>
      <div className="flex items-center gap-2">
        {editable ? <button type="button" className={SECONDARY} onClick={onToggle} aria-pressed={editing}>{editing ? "Done" : "Edit Quote"}</button> : null}
        <button type="button" onClick={() => api.setOpen(false)} aria-label="Close" className={`flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-neutral-800 ${FOCUS}`}><X className="h-5 w-5" aria-hidden /></button>
      </div>
    </div>
  );
}

function useEscapeToClose(open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);
}

export function QuoteDrawer() {
  const api = useQuoteApi();
  const [editing, setEditing] = useState(false);
  const close = useCallback(() => api.setOpen(false), [api]);
  useEscapeToClose(api.open, close);
  if (!api.open) return null;
  const editable = api.viewer === "user" && api.flags.write_tools_enabled && ["draft", "confirmed"].includes(api.view?.status ?? "");
  return (
    <div className="fixed inset-0 z-40" data-testid="quote-drawer">
      <button type="button" aria-label="Close quote" onClick={close} className="absolute inset-0 bg-black/70" />
      <div role="dialog" aria-modal="true" aria-label="Your quote" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-neutral-800 bg-neutral-950 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-white">
        <DrawerHeader editable={editable} editing={editing} onToggle={() => setEditing((v) => !v)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {api.error ? <p role="alert" className="mb-3 rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm text-white">{api.error}</p> : null}
          {api.viewer === "user" ? <UserBody view={api.view} editing={editing} /> : <GuestBody />}
        </div>
      </div>
    </div>
  );
}
