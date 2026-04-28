"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import { Users, Loader2, Search, CheckCircle2, Clock, UserX, AlertTriangle } from "lucide-react";

interface Candidate {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_type: string;
  status: string;
  created_at: string;
  onboarding_pipelines: { name: string } | null;
  onboarding_steps: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  interview: { label: "Interview", color: "bg-blue-50 text-blue-700" },
  pending_admin_review_1: { label: "Pending Review", color: "bg-amber-50 text-amber-700" },
  welcome_docs_sent: { label: "Welcome Docs", color: "bg-purple-50 text-purple-700" },
  pending_admin_review_2: { label: "Pending Review", color: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", color: "bg-green-50 text-green-700" },
  assigned_to_training: { label: "Training", color: "bg-emerald-50 text-emerald-700" },
  terminated: { label: "Terminated", color: "bg-red-50 text-red-600" },
};

const FILTERS = [
  { value: "", label: "All" },
  { value: "interview", label: "Interviewing" },
  { value: "pending_admin_review_1", label: "Pending Review 1" },
  { value: "welcome_docs_sent", label: "Welcome Docs" },
  { value: "pending_admin_review_2", label: "Pending Review 2" },
  { value: "completed", label: "Completed" },
  { value: "assigned_to_training", label: "Training" },
  { value: "terminated", label: "Terminated" },
];

export default function TeamPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/sales"); return; }
      setToken(session.access_token);
      fetch("/api/sales/users", { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then((r) => r.ok ? r.json() : [])
        .then((users: { id: string; role: string }[]) => {
          const me = users.find((u) => u.id === session.user.id);
          if (!me || (me.role !== "admin" && me.role !== "director_of_sales" && me.role !== "market_leader")) {
            router.push("/sales");
          } else {
            setAuthorized(true);
          }
        });
    });
  }, [router]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = statusFilter ? `?status=${statusFilter}` : "";
    const res = await fetch(`/api/onboarding/candidates${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setCandidates(await res.json());
    setLoading(false);
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (!authorized) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>;

  const filtered = candidates.filter((c) =>
    c.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (status: string) => {
    if (status === "completed" || status === "assigned_to_training") return <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />;
    if (status.includes("pending")) return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    if (status === "terminated") return <UserX className="h-3.5 w-3.5 text-red-500" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-blue-500" />;
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-green-600" />
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <span className="text-sm text-gray-400 ml-2">{candidates.length} members</span>
        </div>
        <Link
          href="/sales/pipelines/onboarding"
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          View Onboarding Pipeline
        </Link>
      </div>

      <div className="flex gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search team..."
            className="w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 py-2.5 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none cursor-pointer"
        >
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-green-600" /></div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Current Step</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/sales/team/${c.id}`} className="font-medium text-gray-900 hover:text-green-600">
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.role_type === "BDP" ? "Business Dev Partner" : "Market Leader"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{c.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{c.onboarding_steps?.name || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[c.status]?.color || "bg-gray-100 text-gray-500"}`}>
                      {statusIcon(c.status)}
                      {STATUS_CONFIG[c.status]?.label || c.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No team members found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
