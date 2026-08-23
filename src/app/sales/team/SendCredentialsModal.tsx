"use client";

/**
 * SendCredentialsModal
 *
 * Opened from /sales/team when an admin clicks the Send Credentials
 * icon on a team-member row. Lets the admin:
 *   - override the destination email (defaults to profile.email)
 *   - add / remove any number of credential rows
 *   - pick from saved presets to prefill System Name + Login URL
 *   - toggle show/hide on the password field
 *   - preview the exact HTML the recipient will receive
 *   - confirm the recipient before firing the send
 *
 * All password handling is client-side plaintext (necessary — the
 * admin is typing them and needs to see them briefly). We never
 * write them to localStorage, sessionStorage, analytics, or the
 * console. Server audit records the send WITHOUT the passwords or
 * usernames (see /api/admin/team/[id]/send-credentials).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Key,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react";

type CredentialRow = {
  id: string;              // client-only, for React keys
  system_name: string;
  login_url: string;
  username: string;
  password: string;
  show_password: boolean;
};

type Preset = { id: string; name: string; default_login_url: string | null };

export interface SendCredentialsModalProps {
  memberId: string;
  memberName: string;
  memberEmail: string;
  token: string;
  onClose: () => void;
  onSent?: (result: { sent_to: string; system_names: string[] }) => void;
}

const MAX_ROWS = 20;

function makeRow(): CredentialRow {
  return {
    // Not cryptographic — just for React keys. crypto.randomUUID is
    // available in every browser we support.
    id: (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `r-${Math.random().toString(36).slice(2)}`,
    system_name: "",
    login_url: "",
    username: "",
    password: "",
    show_password: false,
  };
}

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameOf(full: string): string {
  const t = full.trim().split(/\s+/)[0];
  return t || "there";
}

/** Build the same HTML preview the server will send. Kept in sync
 *  with src/lib/teamCredentials/emails.ts renderCredentialsEmailHtml. */
function buildPreviewHtml(name: string, rows: CredentialRow[]): string {
  const first = firstNameOf(name);
  const sections = rows
    .filter((r) => r.system_name.trim() && r.username.trim() && r.password)
    .map((c) => {
      const url = c.login_url.trim()
        ? `<div style="margin:6px 0"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Login</span><br><a href="${esc(c.login_url)}" style="color:#16A34A;word-break:break-all">${esc(c.login_url)}</a></div>`
        : "";
      return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:12px 0"><div style="font-size:15px;font-weight:700;color:#111827;margin-bottom:6px">${esc(c.system_name)}</div>${url}<div style="margin:6px 0"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Username</span><br><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111827">${esc(c.username)}</span></div><div style="margin:6px 0"><span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em;font-weight:600">Password</span><br><span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#111827">${esc(c.password)}</span></div></div>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111"><div style="margin-bottom:20px"><div style="font-size:11px;font-weight:700;letter-spacing:0.15em;color:#16A34A;text-transform:uppercase">Vending Connector · Apex AI Vending</div></div><h1 style="font-size:22px;font-weight:700;color:#0A0A0A;margin:0 0 12px">Welcome to the team, ${esc(first)} 👋</h1><p style="line-height:1.6;color:#374151;margin:0 0 12px">Congratulations again on your new journey with Vending Connector / Apex AI Vending — we're excited to have you on board.</p><p style="line-height:1.6;color:#374151;margin:0 0 16px">To get started, please use the links and login credentials below to access the systems you'll need for your role.</p>${sections}<p style="line-height:1.6;color:#374151;margin:20px 0 12px">You will also need to check your email for information regarding your <strong>training session</strong>.</p><p style="line-height:1.6;color:#374151;margin:0 0 12px">Please make sure you can successfully access each of the systems above before your training session. If you experience any issues logging in, let your manager know.</p><p style="line-height:1.6;color:#374151;margin:20px 0 0">Looking forward to working with you and helping you get started.<br><br>— The Vending Connector / Apex AI Vending Team</p></div>`;
}

export default function SendCredentialsModal(props: SendCredentialsModalProps) {
  const [recipient, setRecipient] = useState(props.memberEmail);
  const [rows, setRows] = useState<CredentialRow[]>(() => [makeRow()]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [phase, setPhase] = useState<"edit" | "preview" | "confirm" | "sending" | "done">("edit");
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Focus close button on mount so Esc / Tab flow works.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // Load presets — non-fatal if it fails.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/team/credential-presets", {
      headers: { Authorization: `Bearer ${props.token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json?.presets) return;
        setPresets(json.presets as Preset[]);
      })
      .catch(() => { /* silent */ });
    return () => { cancelled = true; };
  }, [props.token]);

  const patchRow = useCallback(
    (id: string, patch: Partial<CredentialRow>) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    },
    [],
  );

  function addRow() {
    setRows((prev) => (prev.length >= MAX_ROWS ? prev : [...prev, makeRow()]));
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function applyPreset(rowId: string, presetId: string) {
    const p = presets.find((x) => x.id === presetId);
    if (!p) return;
    patchRow(rowId, {
      system_name: p.name,
      login_url: p.default_login_url ?? "",
    });
  }

  // Pre-flight validation for the current form.
  const validation = useMemo(() => {
    const errs: string[] = [];
    if (!recipient.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim())) {
      errs.push("Enter a valid recipient email address.");
    }
    const filled = rows.filter(
      (r) => r.system_name.trim() && r.username.trim() && r.password,
    );
    if (filled.length === 0) {
      errs.push("Add at least one complete credential (name, username, password).");
    }
    for (const r of filled) {
      const url = r.login_url.trim();
      if (url) {
        try {
          const u = new URL(url);
          if (u.protocol !== "http:" && u.protocol !== "https:") {
            errs.push(`Login URL for "${r.system_name}" must start with http:// or https://.`);
          }
        } catch {
          errs.push(`Login URL for "${r.system_name}" is not a valid URL.`);
        }
      }
    }
    return errs;
  }, [recipient, rows]);

  async function performSend() {
    setPhase("sending");
    setError(null);
    try {
      const payload = {
        recipient_email: recipient.trim(),
        credentials: rows
          .filter((r) => r.system_name.trim() && r.username.trim() && r.password)
          .map((r) => ({
            system_name: r.system_name.trim(),
            login_url: r.login_url.trim() || null,
            username: r.username.trim(),
            password: r.password,
          })),
      };
      const res = await fetch(`/api/admin/team/${props.memberId}/send-credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${props.token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Send failed (${res.status})`);

      const systemNames = (json.system_names ?? []) as string[];
      setOkMessage(
        `Credentials sent successfully to ${props.memberName} at ${json.sent_to}.`,
      );
      setPhase("done");
      // Clear password material from memory as soon as the send is
      // confirmed. Non-sensitive fields stay so the admin can see
      // what they just sent.
      setRows((prev) => prev.map((r) => ({ ...r, password: "", show_password: false })));
      props.onSent?.({ sent_to: json.sent_to as string, system_names: systemNames });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send credentials.");
      setPhase("edit");
    }
  }

  const previewHtml = useMemo(
    () => buildPreviewHtml(props.memberName, rows),
    [props.memberName, rows],
  );

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Send Login Credentials"
      onClick={(e) => {
        if (e.target === e.currentTarget && phase !== "sending") props.onClose();
      }}
    >
      <div className="mt-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl mb-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Key className="h-5 w-5 text-green-primary" />
              <h2 className="text-lg font-semibold text-gray-900">Send Login Credentials</h2>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Team Member: <span className="font-medium text-gray-800">{props.memberName}</span>
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={props.onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
            disabled={phase === "sending"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* PHASE: edit */}
        {phase === "edit" && (
          <div className="p-6 space-y-5">
            {/* Recipient */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Send To
              </label>
              <input
                type="email"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-green-primary focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Defaults to the team member&apos;s on-file email. Change only if you need to send to a different address.
              </p>
            </div>

            {/* Credentials */}
            <div className="space-y-4">
              {rows.map((row, idx) => (
                <div
                  key={row.id}
                  className="rounded-xl border border-gray-200 bg-gray-50/50 p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Login #{idx + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">System / Credential Name</label>
                      <input
                        type="text"
                        value={row.system_name}
                        onChange={(e) => patchRow(row.id, { system_name: e.target.value })}
                        placeholder="e.g. Vending Connector CRM"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-primary focus:outline-none"
                      />
                      {presets.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => e.target.value && applyPreset(row.id, e.target.value)}
                          className="mt-1 w-full rounded-md border border-gray-100 bg-white px-2 py-1 text-xs text-gray-600 focus:outline-none"
                        >
                          <option value="">Or pick a preset…</option>
                          {presets.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Login URL (optional)</label>
                      <input
                        type="url"
                        value={row.login_url}
                        onChange={(e) => patchRow(row.id, { login_url: e.target.value })}
                        placeholder="https://…"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-primary focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Username / Email</label>
                      <input
                        type="text"
                        value={row.username}
                        onChange={(e) => patchRow(row.id, { username: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-green-primary focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                      <div className="relative">
                        <input
                          type={row.show_password ? "text" : "password"}
                          value={row.password}
                          onChange={(e) => patchRow(row.id, { password: e.target.value })}
                          autoComplete="new-password"
                          spellCheck={false}
                          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 pr-9 text-sm font-mono focus:border-green-primary focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => patchRow(row.id, { show_password: !row.show_password })}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          aria-label={row.show_password ? "Hide password" : "Show password"}
                        >
                          {row.show_password ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addRow}
                disabled={rows.length >= MAX_ROWS}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-green-primary/60 bg-white px-4 py-2 text-sm font-medium text-green-primary hover:bg-green-50 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                Add Another Credential
              </button>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {validation.length > 0 && (
              <ul className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
                {validation.map((v) => <li key={v}>• {v}</li>)}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPhase("preview")}
                disabled={validation.length > 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:border-green-primary hover:text-green-primary disabled:opacity-50"
              >
                <Eye className="h-4 w-4" />
                Preview Email
              </button>
              <button
                type="button"
                onClick={() => setPhase("confirm")}
                disabled={validation.length > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-hover disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                Send Credentials
              </button>
            </div>
          </div>
        )}

        {/* PHASE: preview */}
        {phase === "preview" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPhase("edit")}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to edit
              </button>
              <span className="text-xs text-gray-500">Live preview — this is exactly what will send.</span>
            </div>
            <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 bg-white p-4">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("edit")}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setPhase("confirm")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-hover"
              >
                <Send className="h-4 w-4" />
                Send Credentials
              </button>
            </div>
          </div>
        )}

        {/* PHASE: confirm */}
        {phase === "confirm" && (
          <div className="p-6 space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="text-base font-semibold text-amber-900">Send Credentials?</h3>
              <p className="mt-2 text-sm text-amber-800">
                You are about to email login credentials to:
              </p>
              <div className="mt-3 rounded-lg bg-white/70 px-4 py-3">
                <div className="text-sm font-semibold text-gray-900">{props.memberName}</div>
                <div className="text-sm text-gray-700">{recipient}</div>
              </div>
              <p className="mt-3 text-xs text-amber-800">
                Confirm the email address is correct before continuing. This will send the message immediately.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("edit")}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performSend}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-hover"
              >
                <Send className="h-4 w-4" />
                Send Credentials
              </button>
            </div>
          </div>
        )}

        {/* PHASE: sending */}
        {phase === "sending" && (
          <div className="flex flex-col items-center justify-center gap-3 p-10 text-sm text-gray-600">
            <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
            Sending credentials…
          </div>
        )}

        {/* PHASE: done */}
        {phase === "done" && (
          <div className="p-6 space-y-5">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-800">{okMessage}</p>
              <p className="text-xs text-emerald-700">
                Passwords have been cleared from this form. To resend, re-enter the credentials.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={props.onClose}
                className="rounded-lg bg-green-primary px-4 py-2 text-sm font-semibold text-white hover:bg-green-hover"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
