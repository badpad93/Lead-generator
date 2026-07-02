"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, BarChart3, ArrowLeft, TrendingUp, DollarSign, Package, Users, Star, Trophy } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface AnalyticsData {
  total_contracts: number;
  total_submissions: number;
  total_partners: number;
  active_partners: number;
  fulfilled_contracts: number;
  contracts_by_tier_status: Record<string, Record<string, number>>;
  submissions_by_admin_status: Record<string, number>;
  submissions_by_operator_status: Record<string, number>;
  payouts_total_30d: number;
  payouts_paid_30d: number;
  invoices_total_30d: number;
  invoices_paid_30d: number;
  platform_revenue_30d: number;
  partner_leaderboard: Array<{
    id: string;
    business_name: string | null;
    rating: number | null;
    rating_count: number | null;
    submissions_total: number;
    submissions_accepted: number;
    close_rate: number;
  }>;
}

function StatTile({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: typeof BarChart3;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${color} mb-3`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {detail && <p className="text-xs text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  open: "bg-green-50 text-green-700",
  in_progress: "bg-blue-50 text-blue-700",
  fulfilled: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  expired: "bg-amber-50 text-amber-700",
};

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/admin/marketplace/analytics", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/analytics"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const submissionFunnel = [
    { label: "Submitted", count: data.total_submissions, color: "bg-gray-500" },
    { label: "Admin-approved", count: data.submissions_by_admin_status.approved || 0, color: "bg-blue-500" },
    { label: "Operator-accepted", count: data.submissions_by_operator_status.accepted || 0, color: "bg-emerald-500" },
  ];
  const maxFunnel = Math.max(1, ...submissionFunnel.map((s) => s.count));

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-green-primary" /> Marketplace Analytics
        </h1>
        <p className="text-sm text-gray-500 mt-1">Pipeline health, money movement, and the partner leaderboard.</p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
        <StatTile
          label="Platform Revenue (30d)"
          value={`$${data.platform_revenue_30d.toLocaleString()}`}
          detail={`$${data.invoices_total_30d.toLocaleString()} billed – $${data.payouts_total_30d.toLocaleString()} paid out`}
          icon={DollarSign}
          color="bg-green-50 text-green-primary"
        />
        <StatTile
          label="Payouts Paid (30d)"
          value={`$${data.payouts_paid_30d.toLocaleString()}`}
          detail={`of $${data.payouts_total_30d.toLocaleString()} queued`}
          icon={TrendingUp}
          color="bg-emerald-50 text-emerald-700"
        />
        <StatTile
          label="Invoices Paid (30d)"
          value={`$${data.invoices_paid_30d.toLocaleString()}`}
          detail={`of $${data.invoices_total_30d.toLocaleString()} billed`}
          icon={DollarSign}
          color="bg-blue-50 text-blue-700"
        />
        <StatTile
          label="Fulfilled Contracts"
          value={String(data.fulfilled_contracts)}
          detail={`of ${data.total_contracts} total`}
          icon={Package}
          color="bg-purple-50 text-purple-700"
        />
        <StatTile
          label="Active Partners"
          value={String(data.active_partners)}
          detail={`of ${data.total_partners} onboarded`}
          icon={Users}
          color="bg-amber-50 text-amber-700"
        />
        <StatTile
          label="Total Submissions"
          value={String(data.total_submissions)}
          icon={Package}
          color="bg-blue-50 text-blue-700"
        />
        <StatTile
          label="Pending Reviews"
          value={String(data.submissions_by_admin_status.pending || 0)}
          detail="need admin action"
          icon={Package}
          color="bg-amber-50 text-amber-700"
        />
        <StatTile
          label="Ready for Operator"
          value={String((data.submissions_by_admin_status.approved || 0) - (data.submissions_by_operator_status.accepted || 0) - (data.submissions_by_operator_status.rejected || 0))}
          detail="approved, awaiting decision"
          icon={Package}
          color="bg-green-50 text-green-primary"
        />
      </div>

      {/* Submission funnel */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Submission Funnel</h2>
        <div className="space-y-3">
          {submissionFunnel.map((s, i) => (
            <div key={s.label}>
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span className="font-medium text-gray-700">{s.label}</span>
                <span>
                  {s.count}
                  {i > 0 && submissionFunnel[0].count > 0 && (
                    <span className="text-gray-400 ml-2">({Math.round((s.count / submissionFunnel[0].count) * 100)}%)</span>
                  )}
                </span>
              </div>
              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full ${s.color} transition-all`} style={{ width: `${(s.count / maxFunnel) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contracts by tier */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Contracts by Tier & Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(["1", "2", "3"] as const).map((tier) => {
            const buckets = data.contracts_by_tier_status[tier] || {};
            return (
              <div key={tier} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="text-xs text-gray-500 mb-2">Tier {tier}</p>
                <div className="space-y-1.5">
                  {Object.keys(buckets).length === 0 ? (
                    <p className="text-xs text-gray-400">None</p>
                  ) : (
                    Object.entries(buckets).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
                          {status.replace(/_/g, " ")}
                        </span>
                        <span className="text-sm font-semibold text-gray-900">{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leaderboard */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-gray-900">Partner Leaderboard</h2>
          <span className="text-xs text-gray-400">Top 10 by accepted placements</span>
        </div>
        {data.partner_leaderboard.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No partner activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-500">
                <th className="text-left px-3 py-2 font-medium">#</th>
                <th className="text-left px-3 py-2 font-medium">Partner</th>
                <th className="text-right px-3 py-2 font-medium">Accepted</th>
                <th className="text-right px-3 py-2 font-medium">Total</th>
                <th className="text-right px-3 py-2 font-medium">Close Rate</th>
                <th className="text-right px-3 py-2 font-medium">Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.partner_leaderboard.map((p, i) => (
                <tr key={p.id} className="border-b border-gray-50 last:border-b-0">
                  <td className="px-3 py-3 text-gray-400 text-xs">#{i + 1}</td>
                  <td className="px-3 py-3">
                    <Link href={`/admin/marketplace/partners/${p.id}`} className="text-green-primary hover:underline text-sm font-medium">
                      {p.business_name || `Partner ${p.id.slice(0, 8)}`}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-emerald-700">{p.submissions_accepted}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{p.submissions_total}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{p.close_rate}%</td>
                  <td className="px-3 py-3 text-right">
                    {p.rating != null ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-gray-900">{Number(p.rating).toFixed(1)}</span>
                        <span className="text-xs text-gray-400">({p.rating_count || 0})</span>
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
