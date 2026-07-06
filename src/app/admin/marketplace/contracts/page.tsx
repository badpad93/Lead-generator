"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Briefcase, Filter, ArrowLeft, Play, EyeOff, AlertTriangle } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Contract {
  id: string;
  title: string;
  tier: number;
  partner_payout: number;
  operator_price: number;
  market_state: string | null;
  market_city: string | null;
  machine_type: string | null;
  status: string;
  locations_needed: number;
  locations_filled: number;
  deadline_at: string | null;
  created_at: string;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  open: "bg-green-50 text-green-700",
  in_progress: "bg-blue-50 text-blue-700",
  fulfilled: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
  expired: "bg-amber-50 text-amber-700",
};

export default function AdminContractsPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filter, setFilter] = useState("all");
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    const res = await fetch(`/api/admin/marketplace/contracts?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setContracts(await res.json());
    setLoading(false);
  }, [token, filter]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/contracts"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function openContract(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpening(id);
    const res = await fetch(`/api/admin/marketplace/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: "open" }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Failed to open contract");
    }
    await load();
    setOpening(null);
  }

  const draftCount = contracts.filter((c) => c.status === "draft").length;

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-green-primary mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Admin
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-green-primary" /> Placement Contracts
          </h1>
          <p className="text-sm text-gray-500 mt-1">Package location work for partners. Only open contracts are visible to partners.</p>
        </div>
        <Link
          href="/admin/marketplace/contracts/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
        >
          <Plus className="h-4 w-4" /> New Contract
        </Link>
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

      {draftCount > 0 && filter !== "draft" && (
        <button
          onClick={() => setFilter("draft")}
          className="mb-3 w-full flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-800 hover:bg-amber-100 cursor-pointer"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{draftCount} draft contract{draftCount === 1 ? "" : "s"} not visible to partners</p>
            <p className="text-xs">Click to filter — draft contracts are hidden from the placement provider marketplace until you publish them.</p>
          </div>
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-green-primary" /></div>
      ) : contracts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Briefcase className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-semibold text-gray-900 mb-1">No contracts yet</p>
          <p className="text-sm text-gray-500 mb-4">Create your first contract to hand off placement work to your partners.</p>
          <Link href="/admin/marketplace/contracts/new" className="inline-flex items-center gap-1.5 rounded-xl bg-green-primary hover:bg-green-hover px-4 py-2 text-sm font-semibold text-white cursor-pointer">
            <Plus className="h-4 w-4" /> New Contract
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Tier</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Payout / Price</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Market</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Slots</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/admin/marketplace/contracts/${c.id}`)}
                  className={`border-t border-gray-50 hover:bg-gray-50 cursor-pointer ${c.status === "draft" ? "bg-amber-50/40" : ""}`}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{c.title}</p>
                    <p className="text-xs text-gray-400">{c.machine_type || "VendEra AI"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${c.tier === 3 ? "bg-purple-100 text-purple-700" : c.tier === 2 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                      T{c.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="text-emerald-700 font-semibold">${Number(c.partner_payout).toLocaleString()}</p>
                    <p className="text-gray-400">Op ${Number(c.operator_price).toLocaleString()}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{[c.market_city, c.market_state].filter(Boolean).join(", ") || "Any"}</td>
                  <td className="px-4 py-3 text-gray-700">{c.locations_filled} / {c.locations_needed}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[c.status] || "bg-gray-100 text-gray-600"}`}>
                      {c.status === "draft" && <EyeOff className="h-3 w-3" />}
                      {c.status.replace(/_/g, " ")}
                    </span>
                    {c.status === "draft" && (
                      <p className="text-[10px] text-amber-700 mt-0.5">Hidden from partners</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {c.status === "draft" && (
                      <button
                        onClick={(e) => openContract(c.id, e)}
                        disabled={opening === c.id}
                        className="inline-flex items-center gap-1 rounded-md bg-green-primary hover:bg-green-hover px-2 py-0.5 text-[11px] font-semibold text-white cursor-pointer disabled:opacity-50"
                        title="Publish to partners"
                      >
                        {opening === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Open
                      </button>
                    )}
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
