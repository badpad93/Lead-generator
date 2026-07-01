"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Package, Clock, CheckCircle2, AlertCircle, ArrowRight, ArrowLeft, TrendingUp } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Contract {
  id: string;
  title: string;
  tier: number;
  partner_payout: number;
  market_state: string | null;
  market_city: string | null;
  machine_type: string | null;
  contract_type: string;
  locations_needed: number;
  slots_remaining: number;
  deadline_at: string | null;
  status: string;
  notes: string | null;
}

interface ContractDetail {
  contract: Contract;
  requirements: Array<{ industry: string | null; min_employees: number | null; min_traffic_score: number | null; power_required: boolean; parking_required: boolean }>;
  accepted: boolean;
  my_pending_tier_proposal: { to_tier: number; status: string } | null;
  eligibility: { eligible: boolean; reasons: string[] };
}

export default function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ContractDetail | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTierModal, setShowTierModal] = useState(false);
  const [tierChoice, setTierChoice] = useState<2 | 3>(2);
  const [tierReason, setTierReason] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch(`/api/marketplace/contracts/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [token, id]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push(`/login?redirect=/placement/contracts/${id}`); return; }
      setToken(session.access_token);
    });
  }, [router, id]);

  useEffect(() => { load(); }, [load]);

  async function acceptContract() {
    setError(null);
    setSaving("accept");
    const res = await fetch(`/api/marketplace/contracts/${id}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed to accept");
    } else {
      await load();
    }
    setSaving(null);
  }

  async function proposeTier() {
    setError(null);
    setSaving("tier");
    const res = await fetch(`/api/marketplace/contracts/${id}/tier-proposal`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to_tier: tierChoice, reason: tierReason }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "Failed to propose tier");
    } else {
      setShowTierModal(false);
      setTierReason("");
      await load();
    }
    setSaving(null);
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>;
  }

  const { contract, requirements, accepted, my_pending_tier_proposal, eligibility } = data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <Link href="/placement/contracts" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Contracts
      </Link>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${contract.tier === 3 ? "bg-purple-100 text-purple-700" : contract.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
            TIER {contract.tier}
          </span>
          <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold">
            ${Number(contract.partner_payout).toLocaleString()}/location
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Market</p>
            <p className="font-medium">{[contract.market_city, contract.market_state].filter(Boolean).join(", ") || "Any"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Machine</p>
            <p className="font-medium">{contract.machine_type || "VendEra AI Machine"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Slots Open</p>
            <p className="font-medium">{contract.slots_remaining} / {contract.locations_needed}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Deadline</p>
            <p className="font-medium">{contract.deadline_at ? new Date(contract.deadline_at).toLocaleDateString() : "None"}</p>
          </div>
        </div>
        {contract.notes && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contract.notes}</p>
          </div>
        )}
      </div>

      {requirements.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5 mb-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Requirements</h3>
          <div className="flex flex-wrap gap-2">
            {requirements.map((r, i) => (
              <div key={i} className="flex flex-wrap gap-1.5">
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

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!eligibility.eligible && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900 mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> Not currently eligible
          </p>
          <ul className="text-xs text-amber-800 space-y-1 list-disc list-inside">
            {eligibility.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {accepted ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-900">You&apos;ve accepted this contract</p>
              <p className="text-xs text-emerald-700">Submit candidate locations below to earn your payout.</p>
            </div>
          </div>
          <Link
            href={`/placement/submissions/new?contract=${contract.id}`}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer"
          >
            <Package className="h-4 w-4" /> Submit a Location
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <button
            onClick={acceptContract}
            disabled={!eligibility.eligible || saving === "accept"}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-primary hover:bg-green-hover px-6 py-3 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          >
            {saving === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Accept Contract at Tier {contract.tier} (${Number(contract.partner_payout).toLocaleString()}/location)
          </button>

          {contract.tier < 3 && (
            <>
              {my_pending_tier_proposal ? (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-blue-900">
                      Tier {my_pending_tier_proposal.to_tier} bump requested
                    </p>
                    <p className="text-xs text-blue-700">Waiting for admin review. You can still accept at Tier {contract.tier} above.</p>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowTierModal(true)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 px-6 py-3 text-sm font-medium text-gray-700 cursor-pointer"
                >
                  <TrendingUp className="h-4 w-4" />
                  Request Tier Bump
                </button>
              )}
            </>
          )}
        </div>
      )}

      {showTierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Request Tier Bump</h2>
            <p className="text-xs text-gray-500 mb-4">Ask admin to move this contract to a higher tier before you accept. Only approved bumps unlock the higher payout.</p>

            <label className="block text-xs font-medium text-gray-600 mb-1">Requested Tier</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([2, 3] as const).filter((t) => t > contract.tier).map((t) => (
                <button
                  key={t}
                  onClick={() => setTierChoice(t)}
                  className={`rounded-xl border p-3 text-left transition-colors ${tierChoice === t ? "border-green-primary bg-green-50" : "border-gray-200 hover:bg-gray-50"}`}
                >
                  <p className="text-sm font-semibold text-gray-900">Tier {t}</p>
                  <p className="text-xs text-gray-500">${t === 2 ? "750" : "1,200"}/location</p>
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (visible to admin)</label>
            <textarea
              value={tierReason}
              onChange={(e) => setTierReason(e.target.value)}
              rows={3}
              placeholder="e.g., These are high-difficulty enterprise sites that require executive-level access."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-green-primary focus:outline-none resize-none mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowTierModal(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={proposeTier}
                disabled={saving === "tier"}
                className="rounded-lg bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              >
                {saving === "tier" ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
