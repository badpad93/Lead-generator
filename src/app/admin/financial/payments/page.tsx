"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, DollarSign, Plus, ArrowLeft, Filter } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { PaymentList } from "../page";

interface Payment {
  id: string;
  provider: string;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  buyer_email: string | null;
  method: string | null;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
  { key: "partial_refund", label: "Partial Refund" },
  { key: "chargeback", label: "Chargeback" },
];

const PROVIDER_FILTERS = [
  { key: "all", label: "All Providers" },
  { key: "stripe", label: "Stripe" },
  { key: "quickbooks", label: "QuickBooks" },
  { key: "manual", label: "Manual" },
];

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", status);
    params.set("provider", provider);
    params.set("limit", "200");
    const res = await fetch(`/api/admin/financial/payments?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setPayments(await res.json());
    setLoading(false);
  }, [token, status, provider]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial/payments"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <Link href="/admin/financial" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Financial Center
      </Link>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-primary" /> Payments
          </h1>
          <p className="text-sm text-gray-500 mt-1">Every payment webhook + manual entry lands here.</p>
        </div>
        <Link
          href="/admin/financial/payments/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Record Manual Payment
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:border-green-primary focus:outline-none"
        >
          {PROVIDER_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${status === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">No payments match the current filter.</p>
        ) : (
          <PaymentList payments={payments} />
        )}
      </div>
    </div>
  );
}
