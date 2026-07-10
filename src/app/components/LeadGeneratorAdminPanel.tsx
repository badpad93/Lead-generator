"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck, ShieldOff, RotateCcw } from "lucide-react";

interface AccessBody {
  canAccessLeadGenerator: boolean;
  requiresSubscription: boolean;
  hasActiveSubscription: boolean;
  shouldShowPaymentGate: boolean;
  isPlacementProvider: boolean;
  reason: string;
  subscription: {
    status: string;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  } | null;
}

interface Props {
  userId: string;
  token: string;
}

/**
 * Admin control panel for a user's Lead Generator entitlement. Shown
 * inside the user edit modal on /admin. Renders the resolver's
 * current decision + three admin override actions:
 *
 *   Grant   → source=admin_override, status=active (bypass everything)
 *   Revoke  → source=admin_override, status=revoked (block everything)
 *   Clear   → delete the admin_override row (fall back to role /
 *             subscription logic)
 *
 * All three go through /api/admin/lead-generator/override and are
 * audit-logged.
 */
export default function LeadGeneratorAdminPanel({ userId, token }: Props) {
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<AccessBody | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/lead-generator/status?user_id=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAccess((await res.json()) as AccessBody);
      else setError((await res.json().catch(() => ({}))).error || "Failed to load LG status");
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => { load(); }, [load]);

  async function override(action: "grant" | "revoke" | "clear") {
    let reason = "";
    if (action !== "clear") {
      reason = prompt(`Reason to ${action} Lead Generator access?`) || "";
      if (!reason) return;
    }
    setBusy(action);
    setMessage(null); setError(null);
    try {
      const res = await fetch("/api/admin/lead-generator/override", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId, action, reason }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error || "Override failed");
        return;
      }
      setMessage(
        action === "grant" ? "Lead Generator access granted"
          : action === "revoke" ? "Lead Generator access revoked"
          : "Admin override cleared — falling back to role / subscription",
      );
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading || !access) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Lead Generator status…
      </div>
    );
  }

  const badgeStyle = access.canAccessLeadGenerator
    ? "bg-emerald-100 text-emerald-800"
    : "bg-gray-100 text-gray-600";

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lead Generator</p>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeStyle}`}>
          {access.canAccessLeadGenerator ? "Active" : "Not accessible"}
        </span>
      </div>
      <p className="text-xs text-gray-700">
        <strong>Reason:</strong> {access.reason.replace(/_/g, " ")}
      </p>
      {access.requiresSubscription && access.subscription && (
        <p className="text-[11px] text-gray-500">
          Subscription: {access.subscription.status}
          {access.subscription.current_period_end && ` · ends ${new Date(access.subscription.current_period_end).toLocaleDateString()}`}
        </p>
      )}

      {message && (
        <div className="text-xs text-emerald-700 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" /> {message}
        </div>
      )}
      {error && (
        <div className="text-xs text-red-700 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => override("grant")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
        >
          {busy === "grant" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
          Grant Access
        </button>
        <button
          type="button"
          onClick={() => override("revoke")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-red-200 hover:bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 cursor-pointer disabled:opacity-50"
        >
          {busy === "revoke" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
          Revoke Access
        </button>
        <button
          type="button"
          onClick={() => override("clear")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 hover:bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-700 cursor-pointer disabled:opacity-50"
        >
          {busy === "clear" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          Clear Override
        </button>
      </div>
    </div>
  );
}
