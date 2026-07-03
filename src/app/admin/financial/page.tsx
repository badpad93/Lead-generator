"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, DollarSign, PieChart, ArrowRight, ArrowLeft } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

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

export default function FinancialOverviewPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<Payment[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/admin/financial/payments?limit=25", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRecent(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/financial"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const totalPaidCents = recent.reduce((sum, p) => (p.status === "paid" ? sum + Number(p.amount_cents) : sum), 0);
  const totalPending = recent.filter((p) => p.status === "pending").length;
  const totalFailed = recent.filter((p) => p.status === "failed").length;

  return (
    <div className="p-6">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PieChart className="h-6 w-6 text-green-primary" /> Financial Center
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Every payment across QuickBooks, Stripe, and manual entries flows through this ledger.
          Phase 1 wires in the payments spine and backfill. Refunds, commissions, and reconciliation ship in the following phases.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Tile
          label="Recent Collected (last 25)"
          value={`$${(totalPaidCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        />
        <Tile label="Pending" value={String(totalPending)} />
        <Tile label="Failed" value={String(totalFailed)} tone="warn" />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-primary" /> Recent Payments
          </h2>
          <Link href="/admin/financial/payments" className="text-xs text-green-primary hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : recent.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No payments in the ledger yet. Run the <Link href="/admin/financial/backfill" className="text-green-primary hover:underline">backfill</Link> to hydrate from existing purchases.
          </p>
        ) : (
          <PaymentList payments={recent} />
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === "warn" ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}

export function PaymentList({ payments }: { payments: Payment[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-gray-500 border-b border-gray-100">
          <th className="text-left py-2 px-2 font-medium">Provider</th>
          <th className="text-left py-2 px-2 font-medium">Buyer</th>
          <th className="text-left py-2 px-2 font-medium">Method</th>
          <th className="text-right py-2 px-2 font-medium">Amount</th>
          <th className="text-left py-2 px-2 font-medium">Status</th>
          <th className="text-left py-2 px-2 font-medium">Paid</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((p) => (
          <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
            <td className="py-2 px-2 text-xs text-gray-500 uppercase">{p.provider}</td>
            <td className="py-2 px-2 text-gray-700 text-xs">{p.buyer_email || "—"}</td>
            <td className="py-2 px-2 text-gray-700 text-xs capitalize">{p.method || "—"}</td>
            <td className="py-2 px-2 text-right font-semibold text-emerald-700">
              ${(Number(p.amount_cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td className="py-2 px-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColor(p.status)}`}>
                {p.status.replace(/_/g, " ")}
              </span>
            </td>
            <td className="py-2 px-2 text-xs text-gray-500">
              {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function statusColor(status: string): string {
  if (status === "paid") return "bg-emerald-50 text-emerald-700";
  if (status === "pending") return "bg-amber-50 text-amber-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "refunded" || status === "partial_refund") return "bg-blue-50 text-blue-700";
  if (status === "chargeback" || status === "disputed") return "bg-red-100 text-red-800";
  return "bg-gray-100 text-gray-600";
}
