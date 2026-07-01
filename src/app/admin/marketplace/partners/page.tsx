"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, CheckCircle2, Clock, AlertCircle, XCircle, Users } from "lucide-react";
import { createBrowserClient } from "@/lib/supabase";

interface Partner {
  id: string;
  business_name: string | null;
  partner_type: string;
  onboarding_complete: boolean;
  active: boolean;
  identity_verified_at: string | null;
  w9_uploaded_at: string | null;
  agreement_signed_at: string | null;
  bank_verified_at: string | null;
  rating: number | null;
  contracts_completed: number;
  capacity: number;
  created_at: string;
  profile: { full_name: string; email: string; phone: string | null } | null;
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "onboarding", label: "Onboarding" },
  { key: "pending_verification", label: "Pending Verification" },
  { key: "verified", label: "Verified" },
  { key: "inactive", label: "Inactive" },
];

function statusOf(p: Partner): { label: string; color: string; icon: typeof Clock } {
  if (!p.active) return { label: "Inactive", color: "bg-gray-100 text-gray-500", icon: XCircle };
  if (!p.onboarding_complete) return { label: "Onboarding", color: "bg-blue-50 text-blue-700", icon: Clock };
  if (!p.identity_verified_at) return { label: "Pending Verification", color: "bg-amber-50 text-amber-700", icon: AlertCircle };
  return { label: "Verified", color: "bg-green-50 text-green-700", icon: CheckCircle2 };
}

export default function AdminMarketplacePartnersPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    const res = await fetch(`/api/admin/marketplace/partners?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setPartners(await res.json());
    setLoading(false);
  }, [token, status, search]);

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.access_token) { router.push("/login?redirect=/admin/marketplace/partners"); return; }
      setToken(session.access_token);
    });
  }, [router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="h-6 w-6 text-green-primary" /> Placement Partners
          </h1>
          <p className="text-sm text-gray-500 mt-1">Review, verify, and manage marketplace partners.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, business, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2.5 text-sm focus:border-green-primary focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatus(f.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer ${status === f.key ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-green-primary" />
        </div>
      ) : partners.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          <p className="text-lg font-semibold text-gray-900 mb-1">No partners yet</p>
          <p className="text-sm text-gray-500">Partners will appear here as they complete onboarding.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Partner</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Verified</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Capacity</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Joined</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => {
                const s = statusOf(p);
                const Icon = s.icon;
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/admin/marketplace/partners/${p.id}`)}
                    className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{p.business_name || p.profile?.full_name || "—"}</p>
                      <p className="text-xs text-gray-400 capitalize">{p.partner_type.replace(/_/g, " ")}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <p>{p.profile?.full_name || "—"}</p>
                      <p className="text-xs text-gray-400">{p.profile?.email || ""}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
                        <Icon className="h-3 w-3" />
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <div className="flex flex-col gap-0.5">
                        <span>ID: {p.identity_verified_at ? "✓" : "—"}</span>
                        <span>W9: {p.w9_uploaded_at ? "✓" : "—"}</span>
                        <span>Bank: {p.bank_verified_at ? "✓" : "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.capacity}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
