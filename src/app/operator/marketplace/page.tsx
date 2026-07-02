"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Package, Filter, ArrowRight, CheckCircle2, XCircle, Clock } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Submission {
  id: string;
  contract_id: string;
  business_name: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  industry: string | null;
  employees: number | null;
  traffic_score: number | null;
  power_available: boolean;
  parking_available: boolean;
  machine_recommendation: string | null;
  notes: string | null;
  operator_status: string;
  machine_type: string | null;
  market_city: string | null;
  market_state: string | null;
  created_at: string;
}

const FILTERS = [
  { key: "pending", label: "Pending Review" },
  { key: "accepted", label: "Accepted" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_MAP: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pending", color: "bg-amber-50 text-amber-700", icon: Clock },
  accepted: { label: "Accepted", color: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-50 text-red-700", icon: XCircle },
};

export default function OperatorMarketplacePage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/operator/marketplace/submissions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSubmissions(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/operator/marketplace"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === "all" ? submissions : submissions.filter((s) => s.operator_status === filter);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-green-primary">← Back to Dashboard</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Placement Marketplace</h1>
        <p className="text-sm text-gray-500 mt-1">Locations found by our placement partners. Accept the ones you want; each accept locks a slot on your contract.</p>
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
          <p className="text-lg font-semibold text-gray-900 mb-1">
            {filter === "pending" ? "No pending submissions" : "Nothing here"}
          </p>
          <p className="text-sm text-gray-500">
            {filter === "pending"
              ? "Placement partners are still finding sites. We'll email you when a location is ready for review."
              : "Try a different filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const status = STATUS_MAP[s.operator_status] || STATUS_MAP.pending;
            const Icon = status.icon;
            return (
              <Link
                key={s.id}
                href={`/operator/marketplace/${s.id}`}
                className="block rounded-2xl border border-gray-100 bg-white p-5 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${status.color}`}>
                        <Icon className="h-3 w-3" />
                        {status.label}
                      </span>
                      {s.industry && (
                        <span className="rounded-full bg-purple-50 text-purple-700 text-[10px] px-2.5 py-0.5 font-semibold">{s.industry}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900">{s.business_name}</h3>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[s.city, s.state].filter(Boolean).join(", ") || "No city"}
                      </span>
                      {s.employees != null && <span>· {s.employees} employees</span>}
                      {s.traffic_score != null && <span>· Traffic {s.traffic_score}</span>}
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
