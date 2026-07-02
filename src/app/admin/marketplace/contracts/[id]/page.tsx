"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Play, TrendingUp, Package, Clock, AlertCircle, ChevronRight } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";
import { TIERS } from "@/lib/marketplacePricing";

interface Contract {
  id: string;
  title: string;
  tier: number;
  partner_payout: number;
  operator_price: number;
  platform_fee: number;
  market_state: string | null;
  market_city: string | null;
  machine_type: string | null;
  contract_type: string;
  locations_needed: number;
  locations_filled: number;
  deadline_at: string | null;
  status: string;
  notes: string | null;
  operator_business_name: string | null;
  created_at: string;
}

interface Requirement {
  id: string;
  industry: string | null;
  min_employees: number | null;
  min_traffic_score: number | null;
  power_required: boolean;
  parking_required: boolean;
}

interface Acceptance {
  id: string;
  partner_id: string;
  accepted_at: string;
  released_at: string | null;
}

interface TierProposal {
  id: string;
  partner_id: string;
  from_tier: number;
  to_tier: number;
  reason: string | null;
  status: string;
  created_at: string;
}

interface Submission {
  id: string;
  business_name: string;
  city: string | null;
  state: string | null;
  admin_status: string;
  created_at: string;
}

interface Activity {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
}

interface Detail {
  contract: Contract;
  requirements: Requirement[];
  acceptances: Acceptance[];
  tier_proposals: TierProposal[];
  submissions: Submission[];
  activity: Activity[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  open: "bg-green-50 text-green-700",
  in_progress: "bg-blue-50 text-blue-700",
  fulfilled: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  expired: "bg-amber-50 text-amber-700",
};

const SUB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  changes_requested: "bg-blue-50 text-blue-700",
  rejected: "bg-red-50 text-red-700",
};

export default function AdminContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Detail | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/admin/marketplace/contracts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/admin/marketplace/contracts/${id}`); return; }
      setToken(session.access_token);
    });
  }, [router, id]);

  useEffect(() => { load(); }, [load]);

  async function contractAction(action: string, extra: Record<string, unknown> = {}) {
    setError(null);
    setSaving(action);
    const res = await fetch(`/api/admin/marketplace/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else await load();
    setSaving(null);
  }

  async function proposalAction(proposalId: string, action: "approve" | "deny") {
    setError(null);
    setSaving(`proposal-${proposalId}-${action}`);
    const res = await fetch(`/api/admin/marketplace/tier-proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body.error || "Failed");
    else await load();
    setSaving(null);
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const { contract, requirements, acceptances, tier_proposals, submissions, activity } = data;
  const pendingProposals = tier_proposals.filter((p) => p.status === "pending");
  const activeAcceptances = acceptances.filter((a) => !a.released_at);

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/admin/marketplace/contracts" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Contracts
      </Link>

      {/* Header card */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 mb-4">
        <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${contract.tier === 3 ? "bg-purple-100 text-purple-700" : contract.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                TIER {contract.tier}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[contract.status] || "bg-gray-100 text-gray-600"}`}>
                {contract.status.replace(/_/g, " ")}
              </span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
            {contract.operator_business_name && (
              <p className="text-xs text-gray-500 mt-1">Operator: {contract.operator_business_name}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {contract.status === "draft" && (
              <button
                onClick={() => contractAction("open")}
                disabled={saving === "open"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-primary hover:bg-green-hover px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" /> Open to Partners
              </button>
            )}
            {(contract.status === "open" || contract.status === "in_progress") && (
              <>
                <button
                  onClick={() => contractAction("mark_fulfilled")}
                  disabled={saving === "mark_fulfilled"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Fulfilled
                </button>
                <button
                  onClick={() => contractAction("cancel")}
                  disabled={saving === "cancel"}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> Cancel
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm border-t border-gray-100 pt-4">
          <div>
            <p className="text-xs text-gray-500">Payout / Price</p>
            <p className="font-semibold text-emerald-700">${Number(contract.partner_payout).toLocaleString()}</p>
            <p className="text-xs text-gray-500">Op ${Number(contract.operator_price).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Market</p>
            <p className="font-medium">{[contract.market_city, contract.market_state].filter(Boolean).join(", ") || "Any"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Slots</p>
            <p className="font-medium">{contract.locations_filled} / {contract.locations_needed}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Deadline</p>
            <p className="font-medium">{contract.deadline_at ? new Date(contract.deadline_at).toLocaleDateString() : "None"}</p>
          </div>
        </div>

        {contract.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Notes (visible to partners)</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contract.notes}</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tier proposals inbox */}
      {pendingProposals.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 mb-4">
          <h2 className="text-sm font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Pending Tier Bump Requests
          </h2>
          <div className="space-y-2">
            {pendingProposals.map((p) => (
              <div key={p.id} className="rounded-xl bg-white border border-amber-200 p-3">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="text-sm">
                    <p className="font-semibold text-gray-900">Partner wants Tier {p.to_tier} <span className="text-gray-500 text-xs">(currently Tier {p.from_tier})</span></p>
                    <p className="text-xs text-gray-500">Payout would be ${TIERS[(p.to_tier as 1|2|3)].partner_payout} · Op price ${TIERS[(p.to_tier as 1|2|3)].operator_price}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => proposalAction(p.id, "approve")}
                      disabled={!!saving}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 cursor-pointer disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => proposalAction(p.id, "deny")}
                      disabled={!!saving}
                      className="rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold px-3 py-1.5 cursor-pointer disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                </div>
                {p.reason && <p className="text-xs text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap">{p.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirements */}
      {requirements.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Requirements</h2>
          <div className="flex flex-wrap gap-2">
            {requirements.map((r) => (
              <div key={r.id} className="flex flex-wrap gap-1.5">
                {r.industry && <span className="rounded-full bg-purple-50 text-purple-700 text-xs px-2.5 py-0.5">{r.industry}</span>}
                {r.min_employees && <span className="rounded-full bg-gray-100 text-gray-700 text-xs px-2.5 py-0.5">{r.min_employees}+ employees</span>}
                {r.min_traffic_score && <span className="rounded-full bg-gray-100 text-gray-700 text-xs px-2.5 py-0.5">Traffic {r.min_traffic_score}+</span>}
                {r.power_required && <span className="rounded-full bg-gray-100 text-gray-700 text-xs px-2.5 py-0.5">Power required</span>}
                {r.parking_required && <span className="rounded-full bg-gray-100 text-gray-700 text-xs px-2.5 py-0.5">Parking required</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acceptances */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Accepted Partners ({activeAcceptances.length})</h2>
        {activeAcceptances.length === 0 ? (
          <p className="text-xs text-gray-500">No partners have accepted this contract yet.</p>
        ) : (
          <div className="space-y-2">
            {activeAcceptances.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm">
                <div>
                  <p className="font-medium text-gray-900">Partner #{a.partner_id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">Accepted {new Date(a.accepted_at).toLocaleDateString()}</p>
                </div>
                <Clock className="h-4 w-4 text-gray-400" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submissions */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Submissions ({submissions.length})</h2>
          <Link href="/admin/marketplace/submissions" className="text-xs text-green-primary hover:underline">Global queue →</Link>
        </div>
        {submissions.length === 0 ? (
          <div className="text-center py-6">
            <Package className="mx-auto h-8 w-8 text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">No submissions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {submissions.map((s) => (
              <Link
                key={s.id}
                href={`/admin/marketplace/submissions/${s.id}`}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white hover:bg-gray-50 p-3 text-sm"
              >
                <div>
                  <p className="font-medium text-gray-900">{s.business_name}</p>
                  <p className="text-xs text-gray-500">{[s.city, s.state].filter(Boolean).join(", ") || "No address"} · {new Date(s.created_at).toLocaleDateString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SUB_STATUS_COLORS[s.admin_status] || "bg-gray-100 text-gray-600"}`}>
                    {s.admin_status.replace(/_/g, " ")}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Activity */}
      {activity.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Activity</h2>
          <ol className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 rounded-full bg-gray-300 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-700">{a.description}</p>
                  <p className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
