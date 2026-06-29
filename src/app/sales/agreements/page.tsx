"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";
import {
  Loader2,
  Plus,
  ScrollText,
  MapPin,
  Search,
  Filter,
  Eye,
  Send,
  CheckCircle2,
  Clock,
  Ban,
  AlertCircle,
} from "lucide-react";

interface AgreementRow {
  id: string;
  order_id: string | null;
  agreement_type: string;
  agreement_status: string;
  operator_company_name: string | null;
  operator_legal_name: string | null;
  operator_email: string | null;
  machine_model: string | null;
  machine_quantity: number;
  total_due_prior_to_procurement: number;
  location_business_name: string | null;
  location_contact_name: string | null;
  location_contact_email: string | null;
  placement_machine_count: number | null;
  placement_term_months: number | null;
  commission_pct: number | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-50 text-gray-600 ring-gray-200",
  generated: "bg-blue-50 text-blue-700 ring-blue-200",
  sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  viewed: "bg-purple-50 text-purple-700 ring-purple-200",
  partially_signed: "bg-amber-50 text-amber-700 ring-amber-200",
  signed: "bg-green-50 text-green-700 ring-green-200",
  cancelled: "bg-red-50 text-red-600 ring-red-200",
  expired: "bg-gray-50 text-gray-500 ring-gray-200",
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  draft: Clock,
  generated: Clock,
  sent: Send,
  viewed: Eye,
  partially_signed: AlertCircle,
  signed: CheckCircle2,
  cancelled: Ban,
  expired: Ban,
};

const FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partially_signed", label: "Partially Signed" },
  { value: "signed", label: "Signed" },
  { value: "cancelled", label: "Cancelled" },
];

type AgreementTab = "machine_purchase" | "location_placement";

function formatStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AgreementsListPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [agreements, setAgreements] = useState<AgreementRow[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<AgreementTab>("machine_purchase");

  useEffect(() => {
    const supabase = createBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setToken(session.access_token);
    });
  }, []);

  const fetchAgreements = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (filter !== "all") params.set("status", filter);
    params.set("type", tab);
    const res = await fetch(`/api/sales/agreements?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setAgreements(await res.json());
    setLoading(false);
  }, [token, filter, tab]);

  useEffect(() => {
    fetchAgreements();
  }, [fetchAgreements]);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/sales/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ agreement_type: tab }),
    });
    if (res.ok) {
      const agreement = await res.json();
      router.push(`/sales/agreements/${agreement.id}`);
    }
    setCreating(false);
  }

  const filtered = agreements.filter((ag) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    if (tab === "location_placement") {
      return (
        (ag.location_business_name || "").toLowerCase().includes(q) ||
        (ag.location_contact_name || "").toLowerCase().includes(q) ||
        (ag.location_contact_email || "").toLowerCase().includes(q) ||
        ag.id.toLowerCase().includes(q)
      );
    }
    return (
      (ag.operator_company_name || "").toLowerCase().includes(q) ||
      (ag.operator_legal_name || "").toLowerCase().includes(q) ||
      (ag.operator_email || "").toLowerCase().includes(q) ||
      ag.id.toLowerCase().includes(q)
    );
  });

  const isLocationTab = tab === "location_placement";
  const newLabel = isLocationTab ? "New Location Placement" : "New Purchase Agreement";
  const headerSubtitle = isLocationTab
    ? "Send location placement agreements to host locations for their signature"
    : "Create, customize, and send purchase agreements to operators";

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agreements</h1>
          <p className="text-sm text-gray-500 mt-1">{headerSubtitle}</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {newLabel}
        </button>
      </div>

      {/* Type tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <button
          onClick={() => setTab("machine_purchase")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            tab === "machine_purchase"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <ScrollText className="h-4 w-4" />
          Purchase Agreements
        </button>
        <button
          onClick={() => setTab("location_placement")}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
            tab === "location_placement"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <MapPin className="h-4 w-4" />
          Location Placement Agreements
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={isLocationTab ? "Search by location, contact, or email..." : "Search by company, name, or email..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2.5 text-sm focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600/30"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-4 w-4 text-gray-400" />
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ${
                filter === opt.value
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-green-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          {isLocationTab
            ? <MapPin className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            : <ScrollText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
          }
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            {isLocationTab ? "No Location Placement Agreements" : "No Purchase Agreements"}
          </h2>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            {search || filter !== "all"
              ? "No agreements match your search or filter."
              : `Create your first ${isLocationTab ? "location placement" : "purchase"} agreement to get started.`}
          </p>
          {!search && filter === "all" && (
            <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> {newLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              {isLocationTab ? (
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Machines</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Term</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Commission</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                </tr>
              ) : (
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Equipment</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Created</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500">Source</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filtered.map((ag) => {
                const StatusIcon = STATUS_ICONS[ag.agreement_status] || Clock;
                if (isLocationTab) {
                  return (
                    <tr
                      key={ag.id}
                      onClick={() => router.push(`/sales/agreements/${ag.id}`)}
                      className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 truncate max-w-[200px]">
                          {ag.location_business_name || "—"}
                        </p>
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">
                          {ag.location_contact_email || "No email"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-700 truncate max-w-[140px]">
                        {ag.location_contact_name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLORS[ag.agreement_status] || STATUS_COLORS.draft}`}>
                          <StatusIcon className="h-3 w-3" />
                          {formatStatus(ag.agreement_status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{ag.placement_machine_count || 0}</td>
                      <td className="px-4 py-3 text-gray-700">{ag.placement_term_months || 0} mo</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {ag.commission_pct != null ? `${Number(ag.commission_pct).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {new Date(ag.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr
                    key={ag.id}
                    onClick={() => router.push(`/sales/agreements/${ag.id}`)}
                    className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 truncate max-w-[180px]">
                        {ag.operator_company_name || "—"}
                      </p>
                      <p className="text-xs text-gray-400 truncate max-w-[180px]">
                        {ag.operator_email || "No email"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-700 truncate max-w-[140px]">
                      {ag.operator_legal_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_COLORS[ag.agreement_status] || STATUS_COLORS.draft}`}>
                        <StatusIcon className="h-3 w-3" />
                        {formatStatus(ag.agreement_status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {ag.machine_quantity}x {ag.machine_model || "Machine"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      ${Number(ag.total_due_prior_to_procurement || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(ag.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {ag.order_id ? (
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          Order
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          Standalone
                        </span>
                      )}
                    </td>
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
