"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, DollarSign, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

type Method = "ach" | "manual_check" | "zelle" | "venmo" | "wire";
type AccountType = "checking" | "savings";

interface SavedBank {
  method: string;
  bank_name: string | null;
  account_holder: string | null;
  account_type: string | null;
  routing_last4: string | null;
  account_last4: string | null;
  verified_at: string | null;
  notes: string | null;
}

export default function PlacementPayoutsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [savedBank, setSavedBank] = useState<SavedBank | null>(null);
  const [method, setMethod] = useState<Method>("ach");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("checking");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/marketplace/partners/bank-accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      const b: SavedBank | null = data.bank_account;
      setSavedBank(b);
      if (b) {
        setMethod((b.method as Method) || "ach");
        setBankName(b.bank_name || "");
        setAccountHolder(b.account_holder || "");
        if (b.account_type === "checking" || b.account_type === "savings") setAccountType(b.account_type);
        setNotes(b.notes || "");
      }
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/payouts"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    setError(null);
    setMessage(null);
    const routingDigits = routingNumber.replace(/\D/g, "");
    const accountDigits = accountNumber.replace(/\D/g, "");
    if (method === "ach" || method === "wire") {
      if (!bankName.trim()) { setError("Bank name is required"); return; }
      if (!accountHolder.trim()) { setError("Account holder name is required"); return; }
      if (routingDigits.length !== 9) { setError("Routing number must be 9 digits"); return; }
      if (accountDigits.length < 4 || accountDigits.length > 17) { setError("Account number must be 4-17 digits"); return; }
    } else {
      if (!accountHolder.trim()) { setError("Payee name is required"); return; }
    }

    setSaving(true);
    const res = await fetch("/api/marketplace/partners/bank-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        method,
        bank_name: bankName.trim() || null,
        account_holder: accountHolder.trim(),
        account_type: accountType,
        routing_number: routingDigits || null,
        account_number: accountDigits || null,
        notes: notes.trim() || null,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed to save");
    } else {
      setMessage("Payout details saved");
      setRoutingNumber("");
      setAccountNumber("");
      await load();
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const inputClass = "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-green-primary focus:outline-none";
  const monoInputClass = inputClass + " font-mono";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <Link href="/placement" className="text-sm text-gray-500 hover:text-green-primary flex items-center gap-1.5 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <DollarSign className="h-6 w-6 text-green-primary" /> Payout Details
        </h1>
        <p className="text-sm text-gray-500 mt-1">How we pay you when the operator accepts a location you sourced.</p>
      </div>

      {savedBank && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-900">
            Current on file: {savedBank.method.replace("_", " ")}
            {savedBank.account_last4 ? ` — ****${savedBank.account_last4}` : ""}
            {savedBank.verified_at ? " (verified)" : " (unverified)"}
          </p>
          <p className="text-xs text-green-700 mt-0.5">
            Leave routing / account fields blank to keep this on file, or enter new values to replace it.
          </p>
        </div>
      )}

      {message && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <label className="block text-xs font-medium text-gray-600 mb-1">Payout method</label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
          {(["ach", "wire", "manual_check", "zelle", "venmo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors cursor-pointer capitalize ${method === m ? "border-green-primary bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
            >
              {m.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {method === "ach" || method === "wire" ? "Account holder (name on the account)" : "Payee name"} *
            </label>
            <input
              type="text"
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              className={inputClass}
            />
          </div>

          {(method === "ach" || method === "wire") && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bank name *</label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Chase, Wells Fargo, etc."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Account type</label>
                <div className="flex gap-2">
                  {(["checking", "savings"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setAccountType(t)}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors cursor-pointer capitalize ${accountType === t ? "border-green-primary bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Routing number *</label>
                  <input
                    type="text"
                    value={routingNumber}
                    onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    placeholder="9 digits"
                    inputMode="numeric"
                    className={monoInputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Account number *</label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 17))}
                    placeholder="4-17 digits"
                    inputMode="numeric"
                    className={monoInputClass}
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={method === "zelle" ? "Zelle email or phone" : method === "venmo" ? "Venmo handle (@username)" : method === "manual_check" ? "Mailing address for check" : "Anything we should know"}
              className={`${inputClass} resize-none`}
            />
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gray-500" />
          <span>Routing and account numbers are encrypted at rest and only accessible to our finance team when processing your payout. Your dashboard shows only the last 4 digits.</span>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-2.5 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Payout Details
          </button>
        </div>
      </div>
    </div>
  );
}
