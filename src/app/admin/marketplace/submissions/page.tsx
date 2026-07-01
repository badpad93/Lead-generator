"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Package, Filter, ArrowLeft, ChevronRight } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Submission {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  admin_status: string;
  created_at: string;
  contract: { title: string; tier: number; machine_type: string | null; market_state: string | null; market_city: string | null } | null;
  partner: { business_name: string | null } | null;
}

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "changes_requested", label: "Changes Requested" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  changes_requested: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
};

export default function AdminSubmissionsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filter, setFilter] = useState("pending");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", filter);
    const res = await fetch(`/api/admin/marketplace/submissions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setSubmissions(await res.json());
    setLoading(false);
  }, [token, filter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/submissions"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="h-6 w-6 text-green-primary" /> Submission Queue
        </h1>
        <p className="text-sm text-gray-500 mt-1">Review candidate locations submitted by placement partners.</p>
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
      ) : submissions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">Nothing in this queue</p>
          <p className="text-sm text-gray-500">Try a different filter.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Business</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Contract</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Partner</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Submitted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => router.push(`/admin/marketplace/submissions/${s.id}`)}
                  className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{s.business_name}</p>
                    <p className="text-xs text-gray-400">{[s.city, s.state].filter(Boolean).join(", ") || "No address"}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.contract ? (
                      <>
                        <p className="text-gray-700">{s.contract.title}</p>
                        <p className="text-xs text-gray-400">Tier {s.contract.tier}</p>
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-700 text-xs">{s.partner?.business_name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[s.admin_status] || "bg-gray-100 text-gray-600"}`}>
                      {s.admin_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="h-4 w-4 text-gray-300 inline-block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
