"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, TrendingUp, Filter, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { TIERS } from "@/lib/marketplacePricing";

interface Proposal {
  id: string;
  contract_id: string;
  partner_id: string;
  proposed_by: string | null;
  from_tier: number;
  to_tier: number;
  reason: string | null;
  status: string;
  created_at: string;
  contract: { title: string; market_state: string | null; market_city: string | null; machine_type: string | null } | null;
  proposer: { id: string; full_name: string; email: string } | null;
}

const FILTERS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "denied", label: "Denied" },
  { key: "all", label: "All" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  denied: "bg-red-50 text-red-700",
};

export default function AdminTierProposalsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState("pending");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("status", filter);
    const res = await fetch(`/api/admin/marketplace/tier-proposals?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setProposals(await res.json());
    setLoading(false);
  }, [token, filter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/tier-proposals"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function action(proposalId: string, choice: "approve" | "deny") {
    setError(null);
    setSaving(`${proposalId}-${choice}`);
    const res = await fetch(`/api/admin/marketplace/tier-proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: choice }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else await load();
    setSaving(null);
  }

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-green-primary" /> Tier Bump Requests
        </h1>
        <p className="text-sm text-gray-500 mt-1">Approve or deny tier bumps requested by placement partners before they accept a contract.</p>
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

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : proposals.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <TrendingUp className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">Nothing here</p>
          <p className="text-sm text-gray-500">Tier bump requests will show up as partners send them.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => {
            const toPricing = TIERS[(p.to_tier as 1|2|3)] || TIERS[1];
            const fromPricing = TIERS[(p.from_tier as 1|2|3)] || TIERS[1];
            const delta = toPricing.partner_payout - fromPricing.partner_payout;
            return (
              <div key={p.id} className="rounded-2xl border border-gray-100 bg-white p-5">
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600"}`}>
                        {p.status}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm">
                      <span className="text-gray-500">Tier</span> <span className="font-semibold text-gray-900">{p.from_tier}</span>
                      <span className="text-gray-500 mx-2">→</span>
                      <span className="font-semibold text-emerald-700">{p.to_tier}</span>
                      <span className="text-gray-500 mx-2">·</span>
                      <span className="text-gray-500">Payout</span> <span className="font-semibold text-gray-900">${fromPricing.partner_payout}</span>
                      <span className="text-gray-500 mx-2">→</span>
                      <span className="font-semibold text-emerald-700">${toPricing.partner_payout}</span>
                      <span className="text-emerald-700 ml-1">(+${delta})</span>
                    </p>
                    {p.contract && (
                      <p className="text-xs text-gray-500 mt-1">
                        <Link href={`/admin/marketplace/contracts/${p.contract_id}`} className="text-green-primary hover:underline">
                          {p.contract.title}
                        </Link>
                        {" · "}
                        {[p.contract.market_city, p.contract.market_state].filter(Boolean).join(", ") || "Any market"}
                      </p>
                    )}
                    {p.proposer && (
                      <p className="text-xs text-gray-500">Requested by {p.proposer.full_name || p.proposer.email}</p>
                    )}
                  </div>
                  {p.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => action(p.id, "approve")}
                        disabled={!!saving}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => action(p.id, "deny")}
                        disabled={!!saving}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Deny
                      </button>
                    </div>
                  )}
                </div>
                {p.reason && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500 mb-1">Partner reason</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.reason}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
