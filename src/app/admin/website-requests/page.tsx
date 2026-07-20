"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Globe, Filter, Search, ExternalLink } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Row {
  id: string;
  status: string;
  business_name: string | null;
  primary_contact: string | null;
  email: string | null;
  current_domain: string | null;
  existing_website: string | null;
  updated_at: string;
  submitted_at: string | null;
  assigned_to: string | null;
  user: { id: string; full_name: string | null; email: string | null; role: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-blue-100 text-blue-800",
  needs_information: "bg-amber-100 text-amber-800",
  approved_for_build: "bg-emerald-100 text-emerald-800",
  in_development: "bg-emerald-100 text-emerald-800",
  client_review: "bg-purple-100 text-purple-800",
  ready_to_launch: "bg-purple-100 text-purple-800",
  launched: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
};

const FILTERS = [
  { key: "", label: "All" },
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under Review" },
  { key: "needs_information", label: "Needs Info" },
  { key: "approved_for_build", label: "Approved" },
  { key: "in_development", label: "In Development" },
  { key: "client_review", label: "Client Review" },
  { key: "ready_to_launch", label: "Ready to Launch" },
  { key: "launched", label: "Launched" },
  { key: "cancelled", label: "Cancelled" },
];

export default function AdminWebsiteRequestsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async (t: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    const res = await fetch(`/api/admin/website-requests?${params}`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (res.ok) setRows((await res.json()).requests || []);
    setLoading(false);
  }, [status, q]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/website-requests"); return; }
      setToken(session.access_token);
      load(session.access_token);
    });
  }, [router, load]);

  useEffect(() => { if (token) load(token); }, [token, load]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Globe className="h-6 w-6 text-green-600" /> Website Requests
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Customer-submitted website intakes — review, request more info, approve, and manage status
          through launch.
        </p>
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${status === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex items-center gap-2">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search business / contact / email"
            className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white">
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-green-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-sm text-gray-500 text-center">No requests match the current filter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-100">
                <th className="text-left py-2 px-3 font-medium">Business</th>
                <th className="text-left py-2 px-3 font-medium">Contact</th>
                <th className="text-left py-2 px-3 font-medium">Domain</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
                <th className="text-left py-2 px-3 font-medium">Submitted</th>
                <th className="text-left py-2 px-3 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50 cursor-pointer" onClick={() => router.push(`/admin/website-requests/${r.id}`)}>
                  <td className="py-2 px-3">
                    <p className="font-medium text-gray-900">{r.business_name || <span className="text-gray-400">Untitled</span>}</p>
                    <p className="text-[11px] text-gray-500">{r.user?.email}</p>
                  </td>
                  <td className="py-2 px-3 text-gray-700">
                    <p>{r.primary_contact}</p>
                    <p className="text-[11px] text-gray-400">{r.email}</p>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">
                    {r.current_domain || r.existing_website ? (
                      <a href={r.current_domain ? `https://${r.current_domain}` : r.existing_website!} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-green-primary hover:underline">
                        {r.current_domain || r.existing_website}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status] || "bg-gray-100 text-gray-600"}`}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-xs text-gray-500">{r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}</td>
                  <td className="py-2 px-3 text-xs text-gray-500">{new Date(r.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
