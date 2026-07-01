"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Package, ArrowRight, CheckCircle2, XCircle, Clock, AlertCircle, Filter } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Submission {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  admin_status: string;
  operator_status: string;
  created_at: string;
  placement_contracts: {
    title: string;
    tier: number;
    partner_payout: number;
    machine_type: string | null;
    market_state: string | null;
    market_city: string | null;
  } | null;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending Review", color: "bg-amber-50 text-amber-700", icon: Clock },
  approved: { label: "Approved", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  changes_requested: { label: "Changes Requested", color: "bg-blue-50 text-blue-700", icon: AlertCircle },
  rejected: { label: "Rejected", color: "bg-red-50 text-red-700", icon: XCircle },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "changes_requested", label: "Changes" },
  { key: "rejected", label: "Rejected" },
];

export default function PartnerSubmissionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/marketplace/submissions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSubmissions(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/submissions"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? submissions : submissions.filter((s) => s.admin_status === filter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/placement" className="text-sm text-gray-500 hover:text-green-primary">← Back to Dashboard</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">My Submissions</h1>
        <p className="text-sm text-gray-500 mt-1">Locations you&apos;ve submitted for contracts. Approvals unlock payouts.</p>
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${filter === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">No submissions yet</p>
          <p className="text-sm text-gray-500 mb-4">Accept a contract, then submit a candidate location to earn your payout.</p>
          <Link href="/placement/contracts" className="inline-flex items-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-2.5 text-sm font-semibold text-white cursor-pointer">
            Browse Contracts <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const status = STATUS_MAP[s.admin_status] || STATUS_MAP.pending;
            const Icon = status.icon;
            return (
              <Link
                key={s.id}
                href={`/placement/submissions/${s.id}`}
                className="block rounded-2xl border border-gray-100 bg-white p-5 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.color}`}>
                        <Icon className="h-3 w-3" />
                        {status.label}
                      </span>
                      {s.placement_contracts && (
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${s.placement_contracts.tier === 3 ? "bg-purple-100 text-purple-700" : s.placement_contracts.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                          TIER {s.placement_contracts.tier}
                        </span>
                      )}
                      {s.placement_contracts && (
                        <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold">
                          ${Number(s.placement_contracts.partner_payout).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">{s.business_name}</h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>{[s.city, s.state].filter(Boolean).join(", ") || "No address"}</span>
                      {s.placement_contracts && <span>· {s.placement_contracts.title}</span>}
                      <span>· {new Date(s.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
