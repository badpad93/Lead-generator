"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Star, ArrowLeft, Filter, Lock, Eye } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Rating {
  id: string;
  rater_type: string;
  rater_profile_id: string;
  ratee_type: string;
  ratee_id: string;
  submission_id: string;
  contract_id: string;
  score: number;
  feedback: string | null;
  tags: string[] | null;
  visibility: string;
  created_at: string;
  rater: { full_name: string; email: string } | null;
  submission: { business_name: string; city: string | null; state: string | null } | null;
  contract: { title: string; tier: number } | null;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "partner", label: "About Partners" },
  { key: "operator", label: "About Operators (admin-only)" },
];

export default function AdminRatingsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("ratee_type", filter);
    const res = await fetch(`/api/admin/marketplace/ratings?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setRatings(await res.json());
    setLoading(false);
  }, [token, filter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/ratings"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Star className="h-6 w-6 text-green-primary" /> Marketplace Ratings
        </h1>
        <p className="text-sm text-gray-500 mt-1">Every rating on every submission — partners rating operators are admin-only.</p>
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
      ) : ratings.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Star className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">No ratings yet</p>
          <p className="text-sm text-gray-500">Ratings appear here as operators accept and partners rate.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-4 w-4 ${n <= r.score ? "fill-amber-400 text-amber-400" : "text-gray-200"}`} />
                      ))}
                    </div>
                    <span className="text-sm font-semibold text-gray-900">{r.score}/5</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${r.visibility === "admin_only" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                      {r.visibility === "admin_only" ? <Lock className="h-2.5 w-2.5" /> : <Eye className="h-2.5 w-2.5" />}
                      {r.visibility === "admin_only" ? "Admin-only" : "Visible to ratee"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    <span className="text-gray-500">{r.rater_type === "operator" ? "Operator" : "Partner"}:</span>{" "}
                    <span className="font-medium">{r.rater?.full_name || r.rater?.email || "—"}</span>
                    <span className="text-gray-400"> → </span>
                    <span className="text-gray-500">rated {r.ratee_type}</span>
                  </p>
                  {r.submission && r.contract && (
                    <p className="text-xs text-gray-500">
                      {r.submission.business_name} · {[r.submission.city, r.submission.state].filter(Boolean).join(", ")} · {r.contract.title} (Tier {r.contract.tier})
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>

              {r.feedback && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-2 mt-2">{r.feedback}</p>
              )}
              {r.tags && r.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.tags.map((t) => (
                    <span key={t} className="rounded-full bg-gray-100 text-gray-600 text-[10px] px-2.5 py-0.5">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
