"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Package, Clock, ArrowRight, Filter } from "lucide-react";
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
  created_at: string;
}

interface MyContract extends Contract {
  locations_filled: number;
  my_accepted_at: string | null;
  my_slots_locked: number;
  my_submissions: { submitted: number; accepted: number; pending: number; rejected: number };
}

export default function PartnerContractsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<"available" | "mine">("available");
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [myContracts, setMyContracts] = useState<MyContract[]>([]);
  const [filter, setFilter] = useState<"all" | "tier1" | "tier2" | "tier3">("all");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const [availRes, mineRes] = await Promise.all([
      fetch("/api/marketplace/contracts", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/marketplace/my-contracts", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    if (availRes.ok) setContracts(await availRes.json());
    if (mineRes.ok) setMyContracts(await mineRes.json());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/placement/contracts"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const filtered = contracts.filter((c) => {
    if (filter === "all") return true;
    return c.tier === Number(filter.replace("tier", ""));
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link href="/placement" className="text-sm text-gray-500 hover:text-green-primary">← Back to Dashboard</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Contracts</h1>
        <p className="text-sm text-gray-500 mt-1">Browse open contracts or track the ones you&apos;re working on.</p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab("available")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${tab === "available" ? "border-green-primary text-green-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          Available ({contracts.length})
        </button>
        <button
          onClick={() => setTab("mine")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px cursor-pointer ${tab === "mine" ? "border-green-primary text-green-primary" : "border-transparent text-gray-500 hover:text-gray-700"}`}
        >
          My Active Contracts ({myContracts.length})
        </button>
      </div>

      {tab === "available" && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-gray-400" />
          {(["all", "tier1", "tier2", "tier3"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${filter === k ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
            >
              {k === "all" ? "All Tiers" : `Tier ${k.replace("tier", "")}`}
            </button>
          ))}
          <p className="ml-auto text-[11px] text-gray-500">Contracts stay visible to other PPs after you accept — everyone can submit locations until every slot is filled.</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : tab === "mine" ? (
        myContracts.length === 0 ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-lg font-semibold text-gray-900 mb-1">You haven&apos;t accepted any contracts yet</p>
            <p className="text-sm text-gray-500">Browse available contracts to start earning.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myContracts.map((c) => (
              <Link
                key={c.id}
                href={`/placement/contracts/${c.id}`}
                className="block rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5 hover:border-emerald-200 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.tier === 3 ? "bg-purple-100 text-purple-700" : c.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                        TIER {c.tier}
                      </span>
                      <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold">
                        ${Number(c.partner_payout).toLocaleString()}/location
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.status === "fulfilled" ? "bg-gray-100 text-gray-500" : "bg-emerald-100 text-emerald-700"}`}>
                        {c.status === "fulfilled" ? "FULFILLED" : "ACTIVE"}
                      </span>
                    </div>
                    <h3 className="font-semibold text-gray-900">{c.title}</h3>
                    <div className="mt-1 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[c.market_city, c.market_state].filter(Boolean).join(", ") || "Any market"}
                      </span>
                      <span className="font-medium text-emerald-700">{c.slots_remaining} / {c.locations_needed} slots still open</span>
                      <span>You submitted: {c.my_submissions.submitted} ({c.my_submissions.accepted} accepted, {c.my_submissions.pending} pending, {c.my_submissions.rejected} rejected)</span>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-300 shrink-0 mt-1" />
                </div>
              </Link>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">No open contracts right now</p>
          <p className="text-sm text-gray-500">Check back soon or expand your territories to see more work.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              href={`/placement/contracts/${c.id}`}
              className="block rounded-2xl border border-gray-100 bg-white p-5 hover:border-green-200 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${c.tier === 3 ? "bg-purple-100 text-purple-700" : c.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                      TIER {c.tier}
                    </span>
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2.5 py-0.5 text-[10px] font-semibold">
                      ${Number(c.partner_payout).toLocaleString()}/location
                    </span>
                    {c.deadline_at && (
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Due {new Date(c.deadline_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900">{c.title}</h3>
                  <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {[c.market_city, c.market_state].filter(Boolean).join(", ") || "Any market"}
                    </span>
                    <span>{c.machine_type || "VendEra AI Machine"}</span>
                    <span>{c.slots_remaining} / {c.locations_needed} slots open</span>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-300 shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
