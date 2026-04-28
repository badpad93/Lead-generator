"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { Loader2, DollarSign } from "lucide-react";
import type { SalesCommission } from "@/lib/salesTypes";

export default function CommissionsPage() {
  const [commissions, setCommissions] = useState<SalesCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setToken(session.access_token);
        const res = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const me = await res.json();
          setIsAdmin(me.role === "admin" || me.role === "director_of_sales" || me.role === "market_leader");
        }
      }
    }
    init();
  }, []);

  const fetchCommissions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await fetch("/api/sales/commissions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setCommissions(await res.json());
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchCommissions(); }, [fetchCommissions]);

  async function handleStatusChange(id: string, status: string) {
    await fetch("/api/sales/commissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status }),
    });
    fetchCommissions();
  }

  const totalPending = commissions
    .filter((c) => c.status === "pending")
    .reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalApproved = commissions
    .filter((c) => c.status === "approved")
    .reduce((s, c) => s + Number(c.commission_amount), 0);
  const totalPaid = commissions
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.commission_amount), 0);

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 ring-yellow-200",
    approved: "bg-blue-50 text-blue-700 ring-blue-200",
    paid: "bg-green-50 text-green-700 ring-green-200",
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Commissions</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Pending</p>
          <p className="mt-1 text-2xl font-bold text-yellow-600">
            ${totalPending.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Approved</p>
          <p className="mt-1 text-2xl font-bold text-blue-600">
            ${totalApproved.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Paid</p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-green-600" /></div>
      ) : commissions.length === 0 ? (
        <div className="py-16 text-center">
          <DollarSign className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">No commissions yet. Commissions are created when deals are won.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500">Deal</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Deal Value</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Rate</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-right">Commission</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 font-medium text-gray-500">Date</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-gray-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {commissions.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {c.sales_deals?.business_name || "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    ${Number(c.deal_value).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {(Number(c.commission_rate) * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-600">
                    ${Number(c.commission_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset capitalize ${statusColor[c.status] || ""}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      <select
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value)}
                        className="rounded border border-gray-200 px-2 py-1 text-xs cursor-pointer"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
